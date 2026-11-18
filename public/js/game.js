/*
 * 3장 섯다 진행 엔진 (UI 와 분리).
 * 한 판 흐름: 학교(기본 판돈) → 2장 → 1차 베팅 → 3번째 장 → 1장 버리기 → 2차 베팅 → 쇼다운
 * hooks: {
 *   decide(player, ctx)  -> Promise<{type}>   베팅 액션
 *   discard(player, ctx) -> Promise<index>     버릴 카드 인덱스(0~2)
 *   update()                                   화면 갱신
 *   log(msg)
 *   regame(info) -> Promise                    재경기 안내
 * }
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const Core = isNode ? require('./core.js') : root.SeotdaCore;

  const ACTION_LABEL = {
    die: '다이', check: '체크', call: '콜', bbing: '삥', ddadang: '따당', half: '하프',
  };

  class SeotdaGame {
    constructor(config, hooks) {
      this.cfg = Object.assign({ ante: 100, startChips: 10000, maxRaisesPerPlayer: 2, maxPlayers: 5 }, config);
      if (this.cfg.players.length < 2 || this.cfg.players.length > this.cfg.maxPlayers) {
        throw new Error('플레이어는 2~' + this.cfg.maxPlayers + '명이어야 합니다.');
      }
      this.players = [];
      this.cfg.players.forEach((p) => this.players.push(this.makePlayer(this.players.length, p)));
      this.hooks = hooks;
      this.dealer = 0;
      this.handNo = 0;
      this.phase = 'idle';
      this.round = 0;
      this.currentBet = 0;
      this.turn = null;
      this.lastResult = null;
      this.regameCount = 0;
    }

    makePlayer(id, p) {
      return {
        id,
        name: p.name,
        isHuman: !!p.isHuman,
        personality: p.personality != null ? p.personality : Math.random(),
        chips: p.chips != null ? p.chips : this.cfg.startChips,
        hand: [], kept: null, discarded: null,
        inHand: false, folded: false,
        contrib: 0, roundBet: 0, raises: 0,
        lastAction: '', gone: false,
      };
    }

    /** 판과 판 사이에만 호출. 나간 사람 자리를 먼저 재사용하고, 없으면 새 자리 */
    addPlayer(p) {
      const free = this.players.find((x) => x.gone);
      if (free) {
        Object.assign(free, this.makePlayer(free.id, p));
        return free;
      }
      if (this.players.length >= this.cfg.maxPlayers) return null;
      const np = this.makePlayer(this.players.length, p);
      this.players.push(np);
      return np;
    }

    get pot() { return this.players.reduce((s, p) => s + p.contrib, 0); }
    alive() { return this.players.filter((p) => p.inHand && !p.folded); }
    seated() { return this.players.filter((p) => p.chips > 0 && !p.gone); }
    canAct(p) { return p.inHand && !p.folded && p.chips > 0; }

    /** start 부터 좌석 순서대로 id 배열 */
    orderFrom(start) {
      const n = this.players.length;
      const out = [];
      for (let k = 0; k < n; k++) out.push((start + k) % n);
      return out;
    }

    nextSeated(from) {
      for (const id of this.orderFrom(from)) if (this.players[id].chips > 0 && !this.players[id].gone) return id;
      return from;
    }

    isOver() {
      const seated = this.seated();
      if (seated.length < 2) return true;
      const humans = this.players.filter((p) => p.isHuman && !p.gone);
      if (humans.length > 0 && humans.every((p) => p.chips <= 0)) return true;
      return false;
    }

    log(m) { this.hooks.log && this.hooks.log(m); }
    update() { this.hooks.update && this.hooks.update(); }

    pay(p, amount) {
      const a = Math.max(0, Math.min(amount, p.chips));
      p.chips -= a; p.contrib += a; p.roundBet += a;
      return a;
    }

    /** 한 판 진행. 결과 객체 반환 */
    async playHand() {
      if (this.isOver()) return { type: 'gameover' };
      this.handNo++;
      this.regameCount = 0;
      this.dealer = this.nextSeated(this.dealer);
      for (const p of this.players) {
        p.inHand = p.chips > 0 && !p.gone;
        p.folded = false; p.contrib = 0; p.roundBet = 0; p.raises = 0;
        p.hand = []; p.kept = null; p.discarded = null; p.lastAction = '';
      }
      this.lastResult = null;
      this.log(`── 제 ${this.handNo}판 시작 · 선: ${this.players[this.dealer].name}`);
      for (const p of this.players.filter((x) => x.inHand)) {
        const paid = this.pay(p, this.cfg.ante);
        p.roundBet = 0;
        if (paid < this.cfg.ante) this.log(`${p.name}: 학교비 ${paid} (올인)`);
      }
      this.log(`학교비 ${this.cfg.ante}씩, 판돈 ${this.pot}`);

      let result;
      for (;;) {
        result = await this.playRound();
        if (result.type === 'regame' && this.regameCount < 5) {
          this.regameCount++;
          this.log(`${result.reason}! 판돈 ${this.pot}을 걸고 재경기합니다.`);
          this.lastResult = result;
          this.phase = 'regame';
          this.update();
          if (this.hooks.regame) await this.hooks.regame(result);
          continue;
        }
        if (result.type === 'regame') {
          // 재경기가 너무 반복되면 그냥 일반 비교로 정산
          result = this.showdown(true);
        }
        break;
      }

      // 다음 선 = 이번 판 최고패 승자
      if (result.winnerId != null) this.dealer = result.winnerId;
      this.phase = 'result';
      this.turn = null;
      this.lastResult = result;
      this.update();
      return result;
    }

    async playRound() {
      const deck = Core.shuffle(Core.makeDeck());
      for (const p of this.alive()) {
        p.hand = [deck.pop(), deck.pop()];
        p.kept = null; p.discarded = null;
      }
      this.phase = 'bet1';
      this.update();
      if (await this.bettingRound(1)) return this.uncontested();

      this.phase = 'deal3';
      for (const p of this.alive()) p.hand.push(deck.pop());
      this.log('세 번째 패를 돌렸습니다.');
      this.update();

      this.phase = 'discard';
      for (const id of this.orderFrom(this.dealer)) {
        const p = this.players[id];
        if (!p.inHand || p.folded) continue;
        this.turn = id;
        this.update();
        let idx = await this.hooks.discard(p, this.makeCtx(p));
        if (!(idx >= 0 && idx <= 2)) idx = Core.bestOption(p.hand).discard;
        p.discarded = p.hand[idx];
        p.kept = p.hand.filter((_, i) => i !== idx);
        if (!p.isHuman || this.players.filter((x) => x.isHuman).length > 1) this.log(`${p.name}: 한 장을 버렸습니다.`);
      }
      this.turn = null;

      this.phase = 'bet2';
      this.update();
      if (await this.bettingRound(2)) return this.uncontested();
      return this.showdown(false);
    }

    makeCtx(p) {
      const toCall = Math.max(0, this.currentBet - p.roundBet);
      return {
        cards: p.hand.slice(),
        kept: p.kept ? p.kept.slice() : null,
        round: this.round,
        phase: this.phase,
        toCall,
        currentBet: this.currentBet,
        pot: this.pot,
        chips: p.chips,
        numAlive: this.alive().length,
        options: this.options(p),
        ante: this.cfg.ante,
        personality: p.personality,
      };
    }

    /** 가능한 액션과 각 액션의 실제 지불액 */
    options(p) {
      const toCall = Math.max(0, this.currentBet - p.roundBet);
      const pot = this.pot;
      const others = this.alive().filter((x) => x !== p && x.chips > 0).length;
      const canRaise = p.raises < this.cfg.maxRaisesPerPlayer && p.chips > toCall && others > 0;
      const unit = Math.max(1, Math.round(this.cfg.ante / 10));
      const roundTo = (v) => Math.max(unit, Math.floor(v / unit) * unit);
      const o = { die: 0, check: null, call: null, bbing: null, ddadang: null, half: null };
      if (toCall === 0) o.check = 0;
      else o.call = Math.min(toCall, p.chips);
      if (canRaise) {
        const cost = (raiseTo) => Math.min(raiseTo - p.roundBet, p.chips);
        if (this.currentBet === 0) o.bbing = cost(this.cfg.ante);
        else o.ddadang = cost(this.currentBet * 2);
        const halfTo = this.currentBet + roundTo((pot + toCall) / 2);
        o.half = cost(halfTo);
        // 같은 금액이면 중복 제거
        if (o.ddadang != null && o.half === o.ddadang) o.ddadang = null;
        if (o.bbing != null && o.half === o.bbing) o.half = null;
      }
      return o;
    }

    applyAction(p, action) {
      const opts = this.options(p);
      let type = action && action.type;
      if (opts[type] == null) type = opts.check != null ? 'check' : 'call';
      const before = this.currentBet;
      let paid = 0;
      if (type === 'die') {
        p.folded = true;
      } else if (type !== 'check') {
        paid = this.pay(p, opts[type]);
      }
      let raised = false;
      if (p.roundBet > before) {
        this.currentBet = p.roundBet;
        if (type !== 'call') { p.raises++; raised = true; }
      }
      const allIn = p.chips === 0 && type !== 'die';
      p.lastAction = ACTION_LABEL[type] + (allIn ? '(올인)' : '');
      this.log(`${p.name}: ${ACTION_LABEL[type]}${paid ? ' ' + paid.toLocaleString() : ''}${allIn ? ' · 올인' : ''}`);
      return raised;
    }

    /** 베팅 라운드. 한 명만 남으면 true */
    async bettingRound(round) {
      this.round = round;
      this.currentBet = 0;
      for (const p of this.players) { p.roundBet = 0; p.raises = 0; if (!p.folded) p.lastAction = ''; }
      const order = this.orderFrom(this.dealer);
      let needs = new Set(order.filter((id) => this.canAct(this.players[id])));
      let pos = 0;
      let guard = 0;
      while (needs.size > 0 && guard++ < 500) {
        if (this.alive().length <= 1) break;
        const id = order[pos % order.length];
        pos++;
        if (!needs.has(id)) continue;
        const p = this.players[id];
        if (!this.canAct(p)) { needs.delete(id); continue; }
        const toCall = this.currentBet - p.roundBet;
        const actable = this.alive().filter((x) => x.chips > 0).length;
        if (actable <= 1 && toCall <= 0) { needs.delete(id); continue; }

        this.turn = id;
        this.update();
        const action = await this.hooks.decide(p, this.makeCtx(p));
        const raised = this.applyAction(p, action);
        needs.delete(id);
        if (raised) {
          needs = new Set(order.filter((x) => x !== id && this.canAct(this.players[x])));
        }
        this.update();
      }
      this.turn = null;
      return this.alive().length <= 1;
    }

    contribMap() {
      const m = {};
      this.players.forEach((p) => { if (p.contrib > 0 || p.inHand) m[p.id] = p.contrib; });
      return m;
    }

    uncontested() {
      const w = this.alive()[0];
      const res = Core.settle(this.contribMap(), [{ id: w.id, hand: { rank: 0 } }], this.orderFrom(this.dealer));
      const pot = this.pot;
      for (const id of Object.keys(res.payout)) this.players[id].chips += res.payout[id];
      this.log(`${w.name} 님만 남아 판돈 ${res.payout[w.id].toLocaleString()}을 가져갑니다.`);
      return { type: 'uncontested', winnerId: w.id, winners: [w.id], payout: res.payout, pot, entries: [] };
    }

    showdown(forceNoRegame) {
      const alive = this.alive();
      const entries = alive.map((p) => {
        if (!p.kept) p.kept = Core.bestOption(p.hand).keep.map((i) => p.hand[i]);
        return { id: p.id, hand: Core.evaluate(p.kept[0], p.kept[1]) };
      });
      if (!forceNoRegame) {
        const rg = Core.checkRegame(entries);
        if (rg) return { type: 'regame', reason: rg.reason, gusaId: rg.id, entries };
      }
      const pot = this.pot;
      const order = this.orderFrom(this.dealer);
      const res = Core.settle(this.contribMap(), entries, order);
      for (const id of Object.keys(res.payout)) this.players[id].chips += res.payout[id];
      const mainWinners = res.pots.length ? res.pots[0].winners : [];
      entries.forEach((e) => this.log(`${this.players[e.id].name}: ${e.hand.name}`));
      res.notes.forEach((n) => this.log(n));
      const names = mainWinners.map((id) => this.players[id].name).join(', ');
      this.log(mainWinners.length > 1 ? `${names} 무승부 — 판돈을 나눠 가집니다.` : `${names} 승리!`);
      return {
        type: 'showdown', entries, payout: res.payout, pots: res.pots, notes: res.notes, pot,
        winners: mainWinners, winnerId: order.find((id) => mainWinners.includes(id)),
      };
    }
  }

  const api = { SeotdaGame, ACTION_LABEL };
  if (isNode) module.exports = api;
  else root.SeotdaGameEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
