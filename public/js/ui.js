/* 화면 처리 */
(function () {
  'use strict';
  const Core = window.SeotdaCore;
  const AI = window.SeotdaAI;
  const { SeotdaGame } = window.SeotdaGameEngine;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const DEFAULT_NAMES = ['나', '김사장', '박타짜', '최고수', '이영감'];
  const PHASE_LABEL = { bet1: '1차 베팅', deal3: '세 번째 패', discard: '한 장 버리기', bet2: '2차 베팅', result: '판 종료', regame: '재경기', idle: '' };
  const { cardEl, miniCards } = window.SeotdaCardsUI;

  /* ── 상태 */
  let game = null;
  let session = 0;
  let viewer = null; // 지금 패를 볼 수 있는 플레이어 id
  let humans = [];
  let speed = 650;
  let bottomId = 0;

  /* ── 설정 화면 */
  let playerCount = 4;
  const seatState = DEFAULT_NAMES.map((n, i) => ({ name: n, human: i === 0 }));

  function renderSetup() {
    const seg = $('#playerCount');
    seg.innerHTML = '';
    for (let n = 2; n <= 5; n++) {
      const b = el('button', n === playerCount ? 'on' : '', n + '명');
      b.type = 'button';
      b.onclick = () => { playerCount = n; renderSetup(); };
      seg.appendChild(b);
    }
    const list = $('#seatList');
    list.innerHTML = '';
    for (let i = 0; i < playerCount; i++) {
      const row = el('div', 'seat-row');
      row.appendChild(el('div', 'num', i + 1));
      const inp = el('input');
      inp.type = 'text'; inp.maxLength = 8; inp.value = seatState[i].name;
      inp.oninput = () => { seatState[i].name = inp.value; };
      const sel = el('select');
      sel.innerHTML = '<option value="h">사람</option><option value="c">컴퓨터</option>';
      sel.value = seatState[i].human ? 'h' : 'c';
      sel.onchange = () => { seatState[i].human = sel.value === 'h'; updateHint(); };
      row.append(inp, sel);
      list.appendChild(row);
    }
    updateHint();
  }
  function updateHint() {
    const h = seatState.slice(0, playerCount).filter((s) => s.human).length;
    let t = '';
    if (h === 0) t = '관전 모드: 컴퓨터끼리 대결합니다.';
    else if (h > 1) t = `사람 ${h}명 — 한 기기를 돌려가며 합니다. 차례마다 패를 가리는 화면이 나와요.`;
    else t = '컴퓨터는 자기 패와 베팅 상황만 보고 판단합니다.';
    $('#setupHint').textContent = t;
  }

  function startGame() {
    session++;
    const cfgPlayers = seatState.slice(0, playerCount).map((s, i) => ({
      name: (s.name || '').trim() || DEFAULT_NAMES[i] || ('P' + (i + 1)),
      isHuman: s.human,
    }));
    speed = Number($('#speed').value);
    game = new SeotdaGame({
      players: cfgPlayers,
      startChips: Number($('#startChips').value),
      ante: Number($('#ante').value),
      maxPlayers: 5,
    }, makeHooks(session));
    humans = game.players.filter((p) => p.isHuman);
    bottomId = humans.length === 1 ? humans[0].id : 0;
    viewer = humans.length === 1 ? humans[0].id : null;
    game.dealer = Math.floor(Math.random() * game.players.length);
    $('#logList').innerHTML = '';
    show('table');
    render();
    runLoop(session);
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  /* ── 엔진 연결 */
  function guard(sess) {
    // 나가기 후 이전 세션의 콜백이 진행되지 않도록 멈춤
    return sess === session ? Promise.resolve() : new Promise(() => {});
  }

  function makeHooks(sess) {
    return {
      update: () => { if (sess === session) render(); },
      log: (m) => { if (sess === session) addLog(m); },
      decide: async (p, ctx) => {
        if (!p.isHuman) {
          await sleep(speed + Math.random() * speed * 0.4);
          await guard(sess);
          return AI.decide(ctx);
        }
        await ensureViewer(p, sess);
        const action = await askAction(p, ctx, sess);
        afterHumanTurn();
        return action;
      },
      discard: async (p, ctx) => {
        if (!p.isHuman) {
          await sleep(speed * 0.6);
          await guard(sess);
          return AI.chooseKeep(ctx.cards, ctx).discard;
        }
        await ensureViewer(p, sess);
        const idx = await askDiscard(p, sess);
        afterHumanTurn();
        return idx;
      },
      regame: async (info) => {
        await showResult(info, sess);
      },
    };
  }

  async function runLoop(sess) {
    while (sess === session && !game.isOver()) {
      const res = await game.playHand();
      if (sess !== session) return;
      await showResult(res, sess);
    }
    if (sess === session) showGameOver();
  }

  async function ensureViewer(p, sess) {
    if (humans.length <= 1) { viewer = p.id; render(); return; }
    viewer = null;
    render();
    $('#curtainTitle').textContent = `${p.name} 님 차례`;
    $('#curtain').classList.add('open');
    await new Promise((resolve) => { $('#curtainBtn').onclick = resolve; });
    $('#curtain').classList.remove('open');
    await guard(sess);
    viewer = p.id;
    render();
  }
  function afterHumanTurn() {
    clearControls();
    if (humans.length > 1) viewer = null;
    render();
  }

  /* ── 사람 입력 */
  function clearControls() {
    $('#actionRow').innerHTML = '';
    $('#myHandLabel').textContent = '';
  }

  function handSummary(p) {
    if (p.kept) return Core.evaluate(p.kept[0], p.kept[1]).name;
    if (p.hand.length === 2) return Core.evaluate(p.hand[0], p.hand[1]).name;
    if (p.hand.length === 3) return '최고 ' + Core.bestOption(p.hand).hand.name;
    return '';
  }

  function askAction(p, ctx, sess) {
    return new Promise((resolve) => {
      const row = $('#actionRow');
      row.innerHTML = '';
      const o = ctx.options;
      $('#myHandLabel').innerHTML = `<b>${p.name}</b> · 내 패: <b>${handSummary(p)}</b>` +
        (ctx.toCall > 0 ? ` · 콜 금액 ${fmt(ctx.toCall)}` : '');
      const add = (type, label, cost) => {
        const b = el('button', 'btn ' + type, `${label}${cost != null && type !== 'die' && type !== 'check' ? `<small>${fmt(cost)}${cost >= p.chips ? ' 올인' : ''}</small>` : ''}`);
        b.disabled = cost == null;
        b.onclick = () => { if (sess === session) resolve({ type }); };
        row.appendChild(b);
      };
      add('die', '다이', 0);
      if (o.check != null) add('check', '체크', 0);
      else add('call', '콜', o.call);
      if (game.currentBet === 0) add('bbing', '삥', o.bbing);
      else add('ddadang', '따당', o.ddadang);
      add('half', '하프', o.half);
    });
  }

  function askDiscard(p, sess) {
    return new Promise((resolve) => {
      const row = $('#actionRow');
      row.innerHTML = '';
      $('#myHandLabel').innerHTML = `<b>${p.name}</b> · 남길 두 장을 고르세요 (나머지 한 장은 버려집니다)`;
      const opts = Core.pairOptions(p.hand);
      const best = Core.bestOption(p.hand);
      opts.forEach((op) => {
        const b = el('button', 'discard-opt' + (op.discard === best.discard ? ' best' : ''));
        b.appendChild(miniCards(op.keep.map((i) => p.hand[i])));
        b.appendChild(el('span', 'nm', op.hand.name));
        b.onclick = () => { if (sess === session) resolve(op.discard); };
        row.appendChild(b);
      });
    });
  }

  /* ── 테이블 그리기 */
  function canSee(p) {
    if (humans.length === 0) return true;
    const reveal = game.phase === 'result' && game.lastResult && game.lastResult.type === 'showdown';
    const regame = game.phase === 'regame';
    if ((reveal || regame) && p.inHand && !p.folded) return true;
    return viewer === p.id;
  }

  function render() {
    if (!game) return;
    $('#handInfo').textContent = `제 ${game.handNo}판 · 학교비 ${fmt(game.cfg.ante)}` + (game.regameCount ? ` · 재경기 ${game.regameCount}` : '');
    $('#phaseLabel').textContent = PHASE_LABEL[game.phase] || '';
    $('#potAmount').textContent = fmt(game.pot);
    let msg = '';
    if (game.turn != null) {
      const t = game.players[game.turn];
      msg = game.phase === 'discard' ? `${t.name} 님이 패를 고르는 중…` : `${t.name} 님 차례`;
    } else if (game.phase === 'result' && game.lastResult) {
      const w = game.lastResult.winners || [];
      msg = w.map((id) => game.players[id].name).join(', ') + (w.length > 1 ? ' 무승부' : ' 승리');
    }
    $('#centerMsg').textContent = msg;

    const seats = $('#seats');
    seats.innerHTML = '';
    const n = game.players.length;
    const winners = game.phase === 'result' && game.lastResult ? (game.lastResult.winners || []) : [];
    // 여러 명이 돌려가며 할 때는 지금 패를 보는 사람을 아래쪽에 둠
    const bottom = humans.length > 1 && viewer != null ? viewer : bottomId;
    const rx = window.innerWidth < 600 ? 33 : 40;
    game.players.forEach((p) => {
      const k = (p.id - bottom + n) % n;
      const ang = (90 + (k * 360) / n) * (Math.PI / 180);
      const x = 50 + rx * Math.cos(ang);
      const y = 47 + 35 * Math.sin(ang);
      const s = el('div', 'seat');
      s.style.left = x + '%';
      s.style.top = y + '%';
      if (game.turn === p.id) s.classList.add('turn');
      if (p.folded) s.classList.add('folded');
      if (!p.inHand && p.chips <= 0) s.classList.add('out');
      if (winners.includes(p.id)) s.classList.add('winner');

      const visible = canSee(p);
      const big = visible && k === 0 && humans.length > 0;
      const cards = el('div', 'cards');
      if (p.inHand && p.hand.length) {
        if (p.kept) {
          p.kept.forEach((c) => cards.appendChild(cardEl(c, { back: !visible, lg: big })));
          if (visible && p.id === viewer && p.discarded && game.phase !== 'result') cards.appendChild(cardEl(p.discarded, { dim: true, lg: big }));
        } else {
          p.hand.forEach((c) => cards.appendChild(cardEl(c, { back: !visible, lg: big })));
        }
      }
      const hn = el('div', 'hand-name', visible && p.inHand && !p.folded && p.hand.length ? handSummary(p) : '');
      const plate = el('div', 'plate');
      const badges = el('div', 'badges');
      if (game.dealer === p.id && game.handNo > 0) badges.appendChild(el('span', 'badge dealer', '선'));
      if (p.isHuman && humans.length > 1) badges.appendChild(el('span', 'badge human', '사람'));
      plate.appendChild(badges);
      plate.appendChild(el('div', 'name', p.name));
      plate.appendChild(el('div', 'chips', fmt(p.chips)));
      let act = p.folded ? '다이' : p.lastAction;
      if (!p.inHand && p.chips <= 0 && game.handNo > 0) act = '탈락';
      const actEl = el('div', 'act' + (act ? ' show' : ''), act || '');
      const bet = el('div', 'bet', p.roundBet > 0 ? `베팅 ${fmt(p.roundBet)}` : '');

      // 아래쪽 좌석은 카드가 위로, 나머지는 카드가 아래로
      if (y > 60) { s.append(hn, cards, plate, actEl); }
      else { s.append(plate, actEl, cards, hn); }
      s.appendChild(bet);
      seats.appendChild(s);
    });
    if (game.turn == null || !game.players[game.turn].isHuman) {
      if (!$('#actionRow').querySelector('button')) {
        const vp = viewer != null ? game.players[viewer] : null;
        $('#myHandLabel').innerHTML = vp && vp.inHand && !vp.folded && vp.hand.length ? `내 패: <b>${handSummary(vp)}</b>` : '';
        $('#actionRow').innerHTML = game.turn != null ? '<div class="waiting">상대 차례를 기다리는 중…</div>' : '';
      }
    }
  }

  function addLog(m) {
    const li = el('li', m.startsWith('──') ? 'sep' : '', m);
    const list = $('#logList');
    list.appendChild(li);
    while (list.children.length > 300) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }

  /* ── 결과 */
  function showResult(res, sess) {
    return new Promise((resolve) => {
      if (sess !== session) return;
      const P = game.players;
      const title = $('#resultTitle');
      const notes = $('#resultNotes');
      const list = $('#resultList');
      list.innerHTML = '';
      notes.textContent = '';
      let btnText = '다음 판';
      if (res.type === 'regame') {
        title.textContent = `${res.reason}! 재경기`;
        notes.textContent = `${P[res.gusaId].name} 님의 ${res.reason}로 판돈 ${fmt(game.pot)}을 그대로 두고 남은 사람끼리 다시 겨룹니다.`;
        btnText = '재경기 시작';
      } else if (res.type === 'uncontested') {
        title.textContent = `${P[res.winnerId].name} 님 승리`;
        notes.textContent = '나머지가 모두 다이했습니다.';
      } else {
        const w = res.winners.map((id) => P[id].name).join(', ');
        title.textContent = res.winners.length > 1 ? `${w} 무승부` : `${w} 승리!`;
        notes.textContent = (res.notes || []).join(' ');
        if ((res.pots || []).length > 1) notes.textContent += ' (올인으로 판돈이 나뉘었습니다)';
      }
      const entries = res.entries || [];
      const rows = P.filter((p) => p.inHand).map((p) => {
        const e = entries.find((x) => x.id === p.id);
        const delta = res.payout ? (res.payout[p.id] || 0) - p.contrib : 0;
        return { p, e, delta };
      });
      rows.sort((a, b) => (b.e ? b.e.hand.rank : -1) - (a.e ? a.e.hand.rank : -1));
      rows.forEach(({ p, e, delta }) => {
        const isWin = (res.winners || []).includes(p.id);
        const r = el('div', 'res-row' + (isWin ? ' win' : ''));
        const who = el('div', 'who', `${p.name}<small>${p.folded ? '다이' : ''}${p.chips === 0 ? ' 칩 없음' : ' ' + fmt(p.chips)}</small>`);
        r.appendChild(who);
        if (e && p.kept) {
          const box = el('div', 'mini');
          p.kept.forEach((c) => box.appendChild(cardEl(c)));
          const wrap = el('div');
          wrap.style.display = 'flex'; wrap.style.gap = '10px'; wrap.style.alignItems = 'center';
          wrap.append(box, el('span', 'hn', e.hand.name));
          r.appendChild(wrap);
        } else {
          r.appendChild(el('div', '', ''));
        }
        if (res.type === 'regame') r.appendChild(el('div', 'delta', ''));
        else r.appendChild(el('div', 'delta ' + (delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''), (delta > 0 ? '+' : '') + fmt(delta)));
        list.appendChild(r);
      });
      if (res.type !== 'regame' && game.isOver()) btnText = '최종 결과';
      $('#resultBtn').textContent = btnText;
      $('#resultModal').classList.add('open');
      $('#resultBtn').onclick = () => {
        $('#resultModal').classList.remove('open');
        if (sess === session) resolve();
      };
    });
  }

  function showGameOver() {
    const P = game.players.slice().sort((a, b) => b.chips - a.chips);
    $('#resultTitle').textContent = '게임 종료';
    const humansLeft = humans.filter((p) => p.chips > 0);
    $('#resultNotes').textContent = humans.length && !humansLeft.length ? '칩을 모두 잃었습니다.' : `${P[0].name} 님이 최종 승자입니다!`;
    const list = $('#resultList');
    list.innerHTML = '';
    P.forEach((p, i) => {
      const r = el('div', 'res-row' + (i === 0 ? ' win' : ''));
      r.append(el('div', 'who', `${i + 1}위 · ${p.name}`), el('div'), el('div', 'delta', fmt(p.chips)));
      list.appendChild(r);
    });
    $('#resultBtn').textContent = '처음으로';
    $('#resultModal').classList.add('open');
    $('#resultBtn').onclick = () => { $('#resultModal').classList.remove('open'); quit(); };
  }

  function quit() {
    session++;
    game = null;
    clearControls();
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('open'));
    show('setup');
  }

  function renderRules() { window.SeotdaCardsUI.fillRules('#rankTable', '#specialTable'); }

  /* ── 이벤트 */
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) $('#' + open.dataset.open).classList.add('open');
    const close = e.target.closest('[data-close]');
    if (close) $('#' + close.dataset.close).classList.remove('open');
    if (e.target.id === 'rules') $('#rules').classList.remove('open');
  });
  $('#startBtn').onclick = startGame;
  $('#quitBtn').onclick = quit;
  $('#toggleLog').onclick = () => {
    const lp = $('#logPanel');
    if (window.matchMedia('(max-width: 900px)').matches) lp.classList.toggle('show');
    else lp.classList.toggle('hide');
  };
  window.addEventListener('resize', () => game && render());

  renderSetup();
  renderRules();
  // 디버깅/테스트용
  window.__seotda = { get game() { return game; } };
})();
