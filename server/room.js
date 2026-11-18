/*
 * 방 하나 = 대기실 + 게임 진행.
 * 게임 엔진은 서버에서만 돌고, 각 플레이어에게는 자기 패만 보이는 화면 데이터를 보냅니다.
 */
'use strict';
const Core = require('../public/js/core.js');
const AI = require('../public/js/ai.js');
const { SeotdaGame } = require('../public/js/game.js');

const MAX_SEATS = 5;
const BOT_NAMES = ['김사장', '박타짜', '최고수', '이영감', '정마담', '고광렬'];
const RESULT_MS = 6000;
const REGAME_MS = 4000;
const DISCONNECTED_TURN_MS = 8000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clampInt = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.members = new Map(); // token -> {token, name, ws, connected, seat}
    this.hostToken = null;
    this.status = 'lobby'; // lobby | playing | over
    this.settings = { startChips: 10000, ante: 100, turnSeconds: 30, botSpeed: Number(process.env.SEOTDA_BOT_SPEED) || 900 };
    this.lobbySeats = []; // [{kind:'human', token} | {kind:'bot', name}]
    this.game = null;
    this.pending = null; // {playerId, kind, ctx, deadline, resolve, timer}
    this.result = null;
    this.nextAt = 0;
    this.readyNext = new Set();
    this.skipWait = null;
    this.chat = [];
    this.logs = [];
    this.closed = false;
    this.emptyTimer = null;
    this.botSeq = 0;
    this.joinQueue = [];
  }

  /* ── 접속 관리 */
  join(ws, token, name) {
    let m = this.members.get(token);
    if (m) {
      // 재접속
      if (m.ws && m.ws !== ws) { try { m.ws.close(4000, 'replaced'); } catch (e) { /* noop */ } }
      m.ws = ws; m.connected = true;
      if (name && this.status === 'lobby') m.name = name;
      this.systemLog(`${m.name} 님이 다시 접속했습니다.`);
    } else {
      const seatsUsed = this.status === 'lobby' ? this.lobbySeats.length : this.activeSeatCount() + this.joinQueue.length;
      if (seatsUsed >= MAX_SEATS) return { error: '방이 가득 찼습니다 (최대 5명).' };
      const taken = new Set([...this.members.values()].map((x) => x.name));
      let nm = name;
      for (let i = 2; taken.has(nm); i++) nm = name + i;
      m = { token, name: nm, ws, connected: true, seat: null };
      this.members.set(token, m);
      if (!this.hostToken) this.hostToken = token;
      if (this.status === 'lobby') this.lobbySeats.push({ kind: 'human', token });
      else this.joinQueue.push(token);
      this.systemLog(`${nm} 님이 들어왔습니다.` + (this.status === 'playing' ? ' (다음 판부터 참여)' : ''));
    }
    clearTimeout(this.emptyTimer);
    this.broadcast();
    return { ok: true, member: m };
  }

  disconnect(ws) {
    for (const m of this.members.values()) {
      if (m.ws === ws) {
        m.connected = false; m.ws = null;
        this.systemLog(`${m.name} 님의 연결이 끊겼습니다.`);
        // 차례 중이었다면 대기 시간을 줄임
        if (this.pending && m.seat === this.pending.playerId) this.armTimer(DISCONNECTED_TURN_MS);
        if (this.status === 'lobby') this.removeMember(m.token, false);
      }
    }
    this.ensureHost();
    this.checkEmpty();
    this.broadcast();
  }

  leave(token) {
    const m = this.members.get(token);
    if (!m) return;
    this.systemLog(`${m.name} 님이 나갔습니다.`);
    this.removeMember(token, true);
    this.ensureHost();
    this.checkEmpty();
    this.broadcast();
  }

  removeMember(token, explicit) {
    const m = this.members.get(token);
    if (!m) return;
    if (this.status === 'lobby') {
      this.lobbySeats = this.lobbySeats.filter((s) => s.token !== token);
      this.members.delete(token);
    } else if (explicit) {
      this.joinQueue = this.joinQueue.filter((t) => t !== token);
      if (m.seat != null && this.game) {
        const p = this.game.players[m.seat];
        p.leaving = true; // 이번 판은 자동 다이, 판이 끝나면 자리 비움
        if (this.pending && this.pending.playerId === m.seat) this.resolvePending(this.defaultFor(this.pending));
      }
      this.members.delete(token);
    }
  }

  ensureHost() {
    const h = this.members.get(this.hostToken);
    if (h && h.connected) return;
    const next = [...this.members.values()].find((m) => m.connected);
    if (next) {
      this.hostToken = next.token;
      this.systemLog(`${next.name} 님이 방장이 되었습니다.`);
    } else if (!h) {
      this.hostToken = null;
    }
  }

  checkEmpty() {
    const anyone = [...this.members.values()].some((m) => m.connected);
    clearTimeout(this.emptyTimer);
    if (!anyone) {
      this.emptyTimer = setTimeout(() => this.close(), this.status === 'lobby' ? 10000 : 120000);
    }
  }

  close() {
    this.closed = true;
    if (this.pending) clearTimeout(this.pending.timer);
    if (this.skipWait) this.skipWait();
    this.onEmpty(this.code);
  }

  activeSeatCount() {
    return this.game ? this.game.players.filter((p) => !p.gone).length : this.lobbySeats.length;
  }

  isHost(token) { return token === this.hostToken; }

  /* ── 대기실 */
  addBot(token) {
    if (!this.isHost(token) || this.status !== 'lobby') return;
    if (this.lobbySeats.length >= MAX_SEATS) return;
    const used = new Set(this.lobbySeats.filter((s) => s.kind === 'bot').map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || ('컴퓨터' + (++this.botSeq));
    this.lobbySeats.push({ kind: 'bot', name: name + '(봇)' });
    this.broadcast();
  }

  removeBot(token, index) {
    if (!this.isHost(token) || this.status !== 'lobby') return;
    const s = this.lobbySeats[index];
    if (s && s.kind === 'bot') this.lobbySeats.splice(index, 1);
    this.broadcast();
  }

  updateSettings(token, st) {
    if (!this.isHost(token) || this.status !== 'lobby' || !st) return;
    this.applySettings(st);
    this.broadcast();
  }

  applySettings(st) {
    if (!st) return;
    this.settings.startChips = clampInt(st.startChips, 1000, 1000000, this.settings.startChips);
    this.settings.ante = clampInt(st.ante, 10, 10000, this.settings.ante);
    this.settings.turnSeconds = clampInt(st.turnSeconds, 10, 120, this.settings.turnSeconds);
  }

  start(token) {
    if (!this.isHost(token) || this.status !== 'lobby') return { error: '방장만 시작할 수 있습니다.' };
    if (this.lobbySeats.length < 2) return { error: '2명 이상이어야 시작할 수 있습니다.' };
    const players = this.lobbySeats.map((s) => (s.kind === 'bot'
      ? { name: s.name, isHuman: false }
      : { name: this.members.get(s.token).name, isHuman: true }));
    this.game = new SeotdaGame({
      players, startChips: this.settings.startChips, ante: this.settings.ante, maxPlayers: MAX_SEATS,
    }, this.makeHooks());
    this.lobbySeats.forEach((s, i) => { if (s.kind === 'human') this.members.get(s.token).seat = i; });
    this.game.dealer = Math.floor(Math.random() * players.length);
    this.status = 'playing';
    this.logs = [];
    this.result = null;
    this.loop().catch((e) => { console.error('[room ' + this.code + ']', e); });
    return { ok: true };
  }

  restart(token) {
    if (!this.isHost(token) || this.status !== 'over') return;
    // 남아 있는 사람 + 봇으로 대기실 재구성
    const seats = [];
    if (this.game) {
      this.game.players.forEach((p) => {
        if (p.gone) return;
        if (!p.isHuman) seats.push({ kind: 'bot', name: p.name });
        else {
          const m = [...this.members.values()].find((x) => x.seat === p.id);
          if (m) seats.push({ kind: 'human', token: m.token });
        }
      });
    }
    this.joinQueue.forEach((t) => { if (this.members.has(t)) seats.push({ kind: 'human', token: t }); });
    this.joinQueue = [];
    for (const m of this.members.values()) m.seat = null;
    this.lobbySeats = seats.slice(0, MAX_SEATS);
    // 연결이 끊긴 사람은 정리
    for (const [t, m] of [...this.members]) {
      if (!m.connected) { this.members.delete(t); this.lobbySeats = this.lobbySeats.filter((s) => s.token !== t); }
    }
    this.game = null;
    this.status = 'lobby';
    this.result = null;
    this.broadcast();
  }

  /* ── 게임 진행 */
  makeHooks() {
    return {
      update: () => this.broadcast(),
      log: (msg) => this.pushLog(msg),
      decide: async (p, ctx) => {
        if (this.closed) return new Promise(() => {});
        if (!p.isHuman) {
          await sleep(this.settings.botSpeed * (0.7 + Math.random() * 0.6));
          return AI.decide(ctx);
        }
        if (p.leaving) return { type: ctx.options.check != null ? 'check' : 'die' };
        return this.prompt(p, 'action', ctx);
      },
      discard: async (p, ctx) => {
        if (this.closed) return new Promise(() => {});
        if (!p.isHuman) {
          await sleep(this.settings.botSpeed * 0.5);
          return AI.chooseKeep(ctx.cards, ctx).discard;
        }
        if (p.leaving) return Core.bestOption(p.hand).discard;
        return this.prompt(p, 'discard', ctx);
      },
      regame: async (info) => {
        this.result = this.resultView(info);
        await this.pause(REGAME_MS);
        this.result = null;
      },
    };
  }

  prompt(p, kind, ctx) {
    return new Promise((resolve) => {
      this.pending = { playerId: p.id, kind, ctx, resolve, timer: null, deadline: 0 };
      const m = this.memberBySeat(p.id);
      this.armTimer(m && m.connected ? this.settings.turnSeconds * 1000 : DISCONNECTED_TURN_MS);
      this.broadcast();
    });
  }

  armTimer(ms) {
    const pd = this.pending;
    if (!pd) return;
    const deadline = Date.now() + ms;
    if (pd.deadline && pd.deadline < deadline) return; // 이미 더 짧은 타이머
    clearTimeout(pd.timer);
    pd.deadline = deadline;
    pd.timer = setTimeout(() => {
      if (this.pending !== pd) return;
      const p = this.game.players[pd.playerId];
      this.pushLog(`${p.name}: 시간 초과`);
      this.resolvePending(this.defaultFor(pd));
    }, ms);
    this.broadcast();
  }

  defaultFor(pd) {
    if (pd.kind === 'discard') return Core.bestOption(this.game.players[pd.playerId].hand).discard;
    return { type: pd.ctx.options.check != null ? 'check' : 'die' };
  }

  resolvePending(value) {
    const pd = this.pending;
    if (!pd) return;
    clearTimeout(pd.timer);
    this.pending = null;
    pd.resolve(value);
  }

  handleAction(token, msg) {
    const m = this.members.get(token);
    const pd = this.pending;
    if (!m || !pd || m.seat !== pd.playerId) return;
    if (msg.t === 'action' && pd.kind === 'action') {
      const type = String(msg.type);
      if (pd.ctx.options[type] == null) return;
      this.resolvePending({ type });
    } else if (msg.t === 'discard' && pd.kind === 'discard') {
      const idx = Number(msg.index);
      if (![0, 1, 2].includes(idx)) return;
      this.resolvePending(idx);
    }
  }

  pause(ms) {
    this.nextAt = Date.now() + ms;
    this.readyNext.clear();
    this.broadcast();
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      const self = this;
      function done() { clearTimeout(t); self.skipWait = null; resolve(); }
      this.skipWait = done;
    });
  }

  ready(token) {
    const m = this.members.get(token);
    if (!m || !this.result) return;
    this.readyNext.add(token);
    const humansConnected = [...this.members.values()].filter((x) => x.connected && x.seat != null);
    if (humansConnected.every((x) => this.readyNext.has(x.token)) && this.skipWait) this.skipWait();
    else this.broadcast();
  }

  async loop() {
    const g = this.game;
    while (!this.closed && this.status === 'playing') {
      // 판 사이: 나간 자리 정리, 대기자 앉히기
      g.players.forEach((p) => {
        if (p.leaving) { p.leaving = false; p.gone = true; p.chips = 0; p.name = p.name + '(나감)'; }
      });
      while (this.joinQueue.length) {
        const t = this.joinQueue[0];
        const m = this.members.get(t);
        if (!m) { this.joinQueue.shift(); continue; }
        const p = g.addPlayer({ name: m.name, isHuman: true });
        if (!p) break;
        m.seat = p.id;
        this.joinQueue.shift();
        this.pushLog(`${m.name} 님이 자리에 앉았습니다.`);
      }
      if (g.isOver()) break;
      const res = await g.playHand();
      if (this.closed) return;
      this.result = this.resultView(res);
      await this.pause(RESULT_MS);
      this.result = null;
    }
    if (this.closed) return;
    this.status = 'over';
    this.broadcast();
  }

  /* ── 화면 데이터 */
  memberBySeat(id) {
    for (const m of this.members.values()) if (m.seat === id) return m;
    return null;
  }

  resultView(res) {
    const g = this.game;
    const P = g.players;
    const entries = (res.entries || []).map((e) => ({
      id: e.id, name: e.hand.name, cards: P[e.id].kept ? P[e.id].kept.slice() : [],
    }));
    const rows = P.filter((p) => p.inHand).map((p) => ({
      id: p.id,
      name: p.name,
      folded: p.folded,
      chips: p.chips,
      delta: res.payout ? (res.payout[p.id] || 0) - p.contrib : 0,
    }));
    return {
      type: res.type,
      reason: res.reason || null,
      gusaName: res.gusaId != null ? P[res.gusaId].name : null,
      winners: res.winners || [],
      notes: res.notes || [],
      split: (res.pots || []).length > 1,
      pot: g.pot,
      entries,
      rows,
      gameOver: res.type !== 'regame' && g.isOver(),
    };
  }

  viewFor(token) {
    const me = this.members.get(token);
    const base = {
      code: this.code,
      status: this.status,
      isHost: this.isHost(token),
      hostName: this.members.get(this.hostToken) ? this.members.get(this.hostToken).name : '',
      settings: this.settings,
      myName: me ? me.name : '',
      mySeat: me ? me.seat : null,
      waiting: this.joinQueue.includes(token),
      chat: this.chat.slice(-50),
      logs: this.logs.slice(-80),
      now: Date.now(),
    };
    if (this.status === 'lobby') {
      base.lobby = this.lobbySeats.map((s) => {
        if (s.kind === 'bot') return { kind: 'bot', name: s.name };
        const m = this.members.get(s.token);
        return { kind: 'human', name: m.name, connected: m.connected, isHost: s.token === this.hostToken, isMe: s.token === token };
      });
      return base;
    }
    const g = this.game;
    const reveal = this.result && (this.result.type === 'showdown' || this.result.type === 'regame');
    base.game = {
      handNo: g.handNo,
      phase: g.phase,
      pot: g.pot,
      ante: g.cfg.ante,
      dealer: g.dealer,
      turn: g.turn,
      currentBet: g.currentBet,
      regameCount: g.regameCount,
      players: g.players.map((p) => {
        const m = this.memberBySeat(p.id);
        const mine = me && me.seat === p.id;
        const visible = mine || (reveal && p.inHand && !p.folded);
        let cards = [];
        if (p.inHand && p.hand.length) {
          const src = p.kept ? p.kept : p.hand;
          cards = visible ? src.slice() : src.map(() => null);
        }
        let handName = '';
        if (visible && p.inHand && !p.folded && p.hand.length) {
          if (p.kept) handName = Core.evaluate(p.kept[0], p.kept[1]).name;
          else if (p.hand.length === 2) handName = Core.evaluate(p.hand[0], p.hand[1]).name;
          else handName = '최고 ' + Core.bestOption(p.hand).hand.name;
        }
        return {
          id: p.id,
          name: p.name,
          isBot: !p.isHuman,
          connected: p.isHuman ? !!(m && m.connected) : true,
          isMe: !!mine,
          chips: p.chips,
          inHand: p.inHand,
          folded: p.folded,
          gone: p.gone || p.leaving,
          lastAction: p.lastAction,
          roundBet: p.roundBet,
          cards,
          discarded: mine && p.discarded && !reveal ? p.discarded : null,
          handName,
        };
      }),
    };
    if (this.pending && me && me.seat === this.pending.playerId) {
      const pd = this.pending;
      base.prompt = { kind: pd.kind, deadline: pd.deadline, toCall: pd.ctx.toCall, options: pd.ctx.options };
      if (pd.kind === 'discard') {
        base.prompt.choices = Core.pairOptions(this.game.players[pd.playerId].hand).map((o) => ({
          discard: o.discard, name: o.hand.name, cards: o.keep.map((i) => this.game.players[pd.playerId].hand[i]),
        }));
        base.prompt.best = Core.bestOption(this.game.players[pd.playerId].hand).discard;
      }
    } else if (this.pending) {
      base.turnDeadline = this.pending.deadline;
    }
    if (this.result) {
      base.result = this.result;
      base.nextAt = this.nextAt;
      base.iAmReady = this.readyNext.has(token);
    }
    if (this.status === 'over') {
      base.ranking = g.players.filter((p) => !p.gone).sort((a, b) => b.chips - a.chips).map((p) => ({ name: p.name, chips: p.chips }));
    }
    return base;
  }

  /* ── 전송 */
  send(m, obj) {
    if (m.ws && m.connected && m.ws.readyState === 1) {
      try { m.ws.send(JSON.stringify(obj)); } catch (e) { /* noop */ }
    }
  }

  broadcast() {
    if (this.closed) return;
    // 같은 이벤트 루프 안의 여러 갱신은 한 번에 모아서 보냄
    if (this.bcastScheduled) return;
    this.bcastScheduled = true;
    setImmediate(() => {
      this.bcastScheduled = false;
      for (const m of this.members.values()) this.send(m, { t: 'state', view: this.viewFor(m.token) });
    });
  }

  pushLog(msg) {
    this.logs.push(msg);
    if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200);
    this.broadcast();
  }

  systemLog(msg) {
    this.chat.push({ sys: true, text: msg, at: Date.now() });
    if (this.chat.length > 100) this.chat.shift();
  }

  addChat(token, text) {
    const m = this.members.get(token);
    if (!m) return;
    const t = String(text || '').trim().slice(0, 120);
    if (!t) return;
    const now = Date.now();
    if (m.lastChat && now - m.lastChat < 400) return; // 도배 방지
    m.lastChat = now;
    this.chat.push({ name: m.name, text: t, at: now });
    if (this.chat.length > 100) this.chat.shift();
    this.broadcast();
  }
}

module.exports = { Room, MAX_SEATS };
