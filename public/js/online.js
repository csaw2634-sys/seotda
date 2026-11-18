/* 온라인 클라이언트: 서버가 보내주는 화면 데이터를 그리기만 합니다. */
(function () {
  'use strict';
  const Core = window.SeotdaCore;
  const { cardEl, miniCards, fillRules } = window.SeotdaCardsUI;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const PHASE_LABEL = { bet1: '1차 베팅', deal3: '세 번째 패', discard: '한 장 버리기', bet2: '2차 베팅', result: '판 종료', regame: '재경기', idle: '' };

  /* ── 접속 정보 (탭마다 다른 플레이어가 되도록 sessionStorage) */
  const store = {
    get token() {
      let t = sessionStorage.getItem('seotda_token');
      if (!t) {
        t = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem('seotda_token', t);
      }
      return t;
    },
    get room() { return sessionStorage.getItem('seotda_room'); },
    set room(v) { if (v) sessionStorage.setItem('seotda_room', v); else sessionStorage.removeItem('seotda_room'); },
    get name() { return localStorage.getItem('seotda_name') || ''; },
    set name(v) { localStorage.setItem('seotda_name', v); },
  };

  let ws = null;
  let view = null;
  let clockOffset = 0;
  let reconnectDelay = 1000;
  let wantRoom = null; // 접속되면 보낼 첫 메시지
  let intentionalClose = false;
  let lastChatCount = 0;
  let chatOpen = false;
  let resultKey = null;

  function serverUrl() {
    if (window.SEOTDA_SERVER) return window.SEOTDA_SERVER;
    if (location.protocol === 'file:') return 'ws://localhost:3000/ws';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    ws = new WebSocket(serverUrl());
    ws.onopen = () => {
      reconnectDelay = 1000;
      banner('');
      if (wantRoom) send(wantRoom);
      else if (store.room) send({ t: 'join', code: store.room, name: store.name, token: store.token });
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      onMessage(m);
    };
    ws.onclose = () => {
      ws = null;
      if (intentionalClose) { intentionalClose = false; return; }
      if (store.room || wantRoom) {
        banner('서버와 연결이 끊겼습니다. 다시 연결하는 중…');
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(10000, reconnectDelay * 2);
      }
    };
  }

  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function onMessage(m) {
    if (m.t === 'joined') {
      store.room = m.code;
      wantRoom = null;
      history.replaceState(null, '', location.pathname + '?room=' + m.code);
    } else if (m.t === 'error') {
      toast(m.msg);
      if (m.code === 'NO_ROOM') {
        store.room = null; wantRoom = null; view = null;
        history.replaceState(null, '', location.pathname);
        show('entry');
      }
    } else if (m.t === 'state') {
      view = m.view;
      clockOffset = view.now - Date.now();
      render();
    }
  }

  /* ── 공통 UI */
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function banner(msg) {
    const b = $('#connBanner');
    b.textContent = msg;
    b.classList.toggle('show', !!msg);
  }
  const serverNow = () => Date.now() + clockOffset;

  /* ── 입장 */
  function getName() {
    const n = $('#nameInput').value.trim();
    if (!n) { toast('닉네임을 입력해주세요.'); $('#nameInput').focus(); return null; }
    store.name = n;
    return n;
  }
  $('#createBtn').onclick = () => {
    const name = getName();
    if (!name) return;
    wantRoom = { t: 'create', name, token: store.token };
    if (ws && ws.readyState === 1) send(wantRoom); else connect();
  };
  $('#joinBtn').onclick = () => {
    const name = getName();
    if (!name) return;
    const code = $('#codeInput').value.trim().toUpperCase();
    if (code.length !== 4) { toast('4자리 방 코드를 입력해주세요.'); return; }
    wantRoom = { t: 'join', code, name, token: store.token };
    if (ws && ws.readyState === 1) send(wantRoom); else connect();
  };
  $('#codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinBtn').click(); });
  $('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('#codeInput').value ? $('#joinBtn') : $('#createBtn')).click(); });

  function leaveRoom() {
    send({ t: 'leave' });
    store.room = null; wantRoom = null; view = null;
    history.replaceState(null, '', location.pathname);
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('open'));
    show('entry');
  }
  $('#lobbyLeaveBtn').onclick = leaveRoom;
  $('#quitBtn').onclick = () => {
    if (view && view.status === 'playing' && view.mySeat != null) {
      const b = $('#quitBtn');
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = '정말 나가기?';
        setTimeout(() => { b.dataset.armed = ''; b.textContent = '나가기'; }, 3000);
        return;
      }
    }
    leaveRoom();
  };
  $('#overLeaveBtn').onclick = leaveRoom;
  $('#restartBtn').onclick = () => send({ t: 'restart' });

  /* ── 대기실 */
  $('#copyLinkBtn').onclick = async () => {
    const link = location.origin + location.pathname + '?room=' + (view ? view.code : '');
    try { await navigator.clipboard.writeText(link); toast('초대 링크를 복사했어요. 친구에게 보내주세요!'); }
    catch (e) { prompt('아래 링크를 복사해서 보내주세요', link); }
  };
  $('#addBotBtn').onclick = () => send({ t: 'addBot' });
  $('#startBtn').onclick = () => send({ t: 'start' });
  ['#setChips', '#setAnte', '#setTurn'].forEach((s) => {
    $(s).onchange = () => send({ t: 'settings', settings: { startChips: $('#setChips').value, ante: $('#setAnte').value, turnSeconds: $('#setTurn').value } });
  });

  function renderLobby() {
    show('lobby');
    $('#lobbyCode').textContent = view.code;
    const slots = $('#seatSlots');
    slots.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const s = view.lobby[i];
      const row = el('div', 'slot' + (s ? '' : ' empty'));
      row.appendChild(el('span', 'num', String(i + 1)));
      if (s) {
        const nm = el('span', 'slot-name', s.name);
        row.appendChild(nm);
        const tags = el('span', 'tags');
        if (s.isHost) tags.appendChild(el('span', 'badge dealer', '방장'));
        if (s.isMe) tags.appendChild(el('span', 'badge human', '나'));
        if (s.kind === 'bot') tags.appendChild(el('span', 'badge bot', '컴퓨터'));
        row.appendChild(tags);
        if (s.kind === 'bot' && view.isHost) {
          const x = el('button', 'linklike', '빼기');
          x.onclick = () => send({ t: 'removeBot', index: i });
          row.appendChild(x);
        }
      } else {
        row.appendChild(el('span', 'slot-name muted', '빈 자리'));
      }
      slots.appendChild(row);
    }
    $('#hostPanel').style.display = view.isHost ? '' : 'none';
    $('#setChips').value = String(view.settings.startChips);
    $('#setAnte').value = String(view.settings.ante);
    $('#setTurn').value = String(view.settings.turnSeconds);
    $('#addBotBtn').disabled = view.lobby.length >= 5;
    $('#startBtn').disabled = view.lobby.length < 2;
    $('#lobbyHint').textContent = view.isHost
      ? (view.lobby.length < 2 ? '친구에게 방 코드나 초대 링크를 보내거나, 컴퓨터를 추가하세요.' : `${view.lobby.length}명 준비 완료. 시작을 누르면 바로 패를 돌립니다.`)
      : `방장(${view.hostName}) 님이 시작하길 기다리는 중… · 시작 칩 ${fmt(view.settings.startChips)} · 학교비 ${fmt(view.settings.ante)} · 제한 ${view.settings.turnSeconds}초`;
    renderChat($('#lobbyChat'));
  }

  /* ── 채팅 */
  document.querySelectorAll('[data-chat]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = f.querySelector('input');
      const text = inp.value.trim();
      if (text) send({ t: 'chat', text });
      inp.value = '';
    });
  });
  function renderChat(list) {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 30;
    list.innerHTML = '';
    (view.chat || []).forEach((c) => {
      const li = el('li', c.sys ? 'sys' : '');
      if (c.sys) li.textContent = c.text;
      else { li.appendChild(el('b', '', c.name + ' ')); li.appendChild(document.createTextNode(c.text)); }
      list.appendChild(li);
    });
    if (atBottom || list.dataset.init !== '1') { list.scrollTop = list.scrollHeight; list.dataset.init = '1'; }
  }
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
      $('#gameChat').classList.toggle('hidden', t.dataset.tab !== 'chat');
      $('#logList').classList.toggle('hidden', t.dataset.tab !== 'log');
      document.querySelector('#logPanel .chat-form').classList.toggle('hidden', t.dataset.tab !== 'chat');
    };
  });
  $('#toggleLog').onclick = () => {
    const lp = $('#logPanel');
    if (window.matchMedia('(max-width: 900px)').matches) { lp.classList.toggle('show'); chatOpen = lp.classList.contains('show'); }
    else lp.classList.toggle('hide');
    $('#chatDot').classList.remove('on');
  };

  /* ── 게임 테이블 */
  function renderTable() {
    show('table');
    const g = view.game;
    $('#handInfo').textContent = `방 ${view.code} · 제 ${g.handNo}판 · 학교비 ${fmt(g.ante)}` + (g.regameCount ? ` · 재경기 ${g.regameCount}` : '') + (view.waiting ? ' · 다음 판부터 참여' : '');
    $('#phaseLabel').textContent = PHASE_LABEL[g.phase] || '';
    $('#potAmount').textContent = fmt(g.pot);
    let msg = '';
    if (g.turn != null) {
      const t = g.players[g.turn];
      msg = g.phase === 'discard' ? `${t.name} 님이 패를 고르는 중…` : `${t.name} 님 차례`;
    } else if (view.result) {
      const w = view.result.winners || [];
      msg = w.map((id) => g.players[id].name).join(', ') + (view.result.type === 'regame' ? '' : (w.length > 1 ? ' 무승부' : ' 승리'));
    }
    $('#centerMsg').textContent = msg;

    const seats = $('#seats');
    seats.innerHTML = '';
    const n = g.players.length;
    const bottom = view.mySeat != null ? view.mySeat : 0;
    const rx = window.innerWidth < 600 ? 33 : 40;
    const winners = view.result ? view.result.winners || [] : [];
    g.players.forEach((p) => {
      const k = (p.id - bottom + n) % n;
      const ang = (90 + (k * 360) / n) * (Math.PI / 180);
      const x = 50 + rx * Math.cos(ang);
      const y = 47 + 35 * Math.sin(ang);
      const s = el('div', 'seat');
      s.style.left = x + '%';
      s.style.top = y + '%';
      if (g.turn === p.id) s.classList.add('turn');
      if (p.folded) s.classList.add('folded');
      if ((!p.inHand && p.chips <= 0) || p.gone) s.classList.add('out');
      if (winners.includes(p.id) && view.result.type !== 'regame') s.classList.add('winner');

      const big = p.isMe && k === 0;
      const cards = el('div', 'cards');
      p.cards.forEach((c) => cards.appendChild(cardEl(c, { lg: big })));
      if (p.discarded) cards.appendChild(cardEl(p.discarded, { dim: true, lg: big }));
      const hn = el('div', 'hand-name', p.handName || '');
      const plate = el('div', 'plate');
      const badges = el('div', 'badges');
      if (g.dealer === p.id && g.handNo > 0) badges.appendChild(el('span', 'badge dealer', '선'));
      if (p.isMe) badges.appendChild(el('span', 'badge human', '나'));
      if (p.isBot) badges.appendChild(el('span', 'badge bot', '봇'));
      if (!p.connected && !p.gone) badges.appendChild(el('span', 'badge off', '연결 끊김'));
      plate.appendChild(badges);
      plate.appendChild(el('div', 'name', p.name));
      plate.appendChild(el('div', 'chips', fmt(p.chips)));
      if (g.turn === p.id && view.turnDeadline) {
        const sec = Math.max(0, Math.ceil((view.turnDeadline - serverNow()) / 1000));
        plate.appendChild(el('div', 'seat-timer', sec + '초'));
      }
      let act = p.folded ? '다이' : p.lastAction;
      if (p.gone) act = '나감';
      else if (!p.inHand && p.chips <= 0 && g.handNo > 0) act = '탈락';
      const actEl = el('div', 'act' + (act ? ' show' : ''), act || '');
      const bet = el('div', 'bet', p.roundBet > 0 ? `베팅 ${fmt(p.roundBet)}` : '');
      if (y > 60) s.append(hn, cards, plate, actEl);
      else s.append(plate, actEl, cards, hn);
      s.appendChild(bet);
      seats.appendChild(s);
    });

    renderControls();
    renderChat($('#gameChat'));
    const logList = $('#logList');
    logList.innerHTML = '';
    (view.logs || []).forEach((m) => logList.appendChild(el('li', m.startsWith('──') ? 'sep' : '', m)));
    logList.scrollTop = logList.scrollHeight;
    const cc = (view.chat || []).filter((c) => !c.sys).length;
    if (cc > lastChatCount && lastChatCount > 0) {
      const lp = $('#logPanel');
      const hidden = window.matchMedia('(max-width: 900px)').matches ? !lp.classList.contains('show') : lp.classList.contains('hide');
      if (hidden) $('#chatDot').classList.add('on');
    }
    lastChatCount = cc;
    renderResult();
    renderOver();
  }

  let promptKey = null;
  function renderControls() {
    const row = $('#actionRow');
    const label = $('#myHandLabel');
    const pr = view.prompt;
    const me = view.mySeat != null ? view.game.players[view.mySeat] : null;
    const key = pr ? JSON.stringify([pr.kind, pr.deadline, view.game.handNo, view.game.phase, view.game.currentBet]) : null;
    if (key && key === promptKey) return; // 같은 차례면 버튼 다시 안 그림
    promptKey = key;
    row.innerHTML = '';
    if (!pr) {
      if (view.waiting) label.textContent = '자리가 나면 다음 판부터 참여합니다. 구경하는 중…';
      else if (me && me.inHand && !me.folded && me.handName) label.innerHTML = '';
      else label.textContent = '';
      if (me && me.inHand && !me.folded && me.handName) {
        label.appendChild(document.createTextNode('내 패: '));
        label.appendChild(el('b', '', me.handName));
      }
      if (view.game.turn != null) row.appendChild(el('div', 'waiting', '상대 차례를 기다리는 중…'));
      return;
    }
    label.innerHTML = '';
    if (pr.kind === 'discard') {
      label.textContent = '남길 두 장을 고르세요 (나머지 한 장은 버려집니다)';
      pr.choices.forEach((ch) => {
        const b = el('button', 'discard-opt' + (ch.discard === pr.best ? ' best' : ''));
        b.appendChild(miniCards(ch.cards));
        b.appendChild(el('span', 'nm', ch.name));
        b.onclick = () => { send({ t: 'discard', index: ch.discard }); row.innerHTML = ''; };
        row.appendChild(b);
      });
      return;
    }
    label.appendChild(document.createTextNode('내 패: '));
    label.appendChild(el('b', '', me ? me.handName : ''));
    if (pr.toCall > 0) label.appendChild(document.createTextNode(` · 콜 금액 ${fmt(pr.toCall)}`));
    const o = pr.options;
    const add = (type, text, cost) => {
      const b = el('button', 'btn ' + type);
      b.appendChild(document.createTextNode(text));
      if (cost != null && type !== 'die' && type !== 'check') b.appendChild(el('small', '', fmt(cost) + (me && cost >= me.chips ? ' 올인' : '')));
      b.disabled = cost == null;
      b.onclick = () => { send({ t: 'action', type }); row.querySelectorAll('button').forEach((x) => { x.disabled = true; }); };
      row.appendChild(b);
    };
    add('die', '다이', 0);
    if (o.check != null) add('check', '체크', 0); else add('call', '콜', o.call);
    if (view.game.currentBet === 0) add('bbing', '삥', o.bbing); else add('ddadang', '따당', o.ddadang);
    add('half', '하프', o.half);
  }

  function renderResult() {
    const r = view.result;
    const modal = $('#resultModal');
    if (!r) { modal.classList.remove('open'); resultKey = null; return; }
    const key = view.game.handNo + ':' + r.type + ':' + view.game.regameCount;
    if (key !== resultKey) {
      resultKey = key;
      const P = view.game.players;
      if (r.type === 'regame') {
        $('#resultTitle').textContent = `${r.reason}! 재경기`;
        $('#resultNotes').textContent = `${r.gusaName} 님의 ${r.reason}로 판돈 ${fmt(r.pot)}을 그대로 두고 남은 사람끼리 다시 겨룹니다.`;
      } else if (r.type === 'uncontested') {
        $('#resultTitle').textContent = `${P[r.winners[0]].name} 님 승리`;
        $('#resultNotes').textContent = '나머지가 모두 다이했습니다.';
      } else {
        const w = r.winners.map((id) => P[id].name).join(', ');
        $('#resultTitle').textContent = r.winners.length > 1 ? `${w} 무승부` : `${w} 승리!`;
        $('#resultNotes').textContent = (r.notes || []).join(' ') + (r.split ? ' (올인으로 판돈이 나뉘었습니다)' : '');
      }
      const list = $('#resultList');
      list.innerHTML = '';
      const rank = (id) => { const e = r.entries.find((x) => x.id === id); return e ? Core.evaluate(e.cards[0], e.cards[1]).rank : -1; };
      r.rows.slice().sort((a, b) => rank(b.id) - rank(a.id)).forEach((row) => {
        const e = r.entries.find((x) => x.id === row.id);
        const div = el('div', 'res-row' + (r.winners.includes(row.id) && r.type !== 'regame' ? ' win' : ''));
        const who = el('div', 'who', row.name);
        who.appendChild(el('small', '', (row.folded ? '다이 ' : '') + (row.chips === 0 ? '칩 없음' : fmt(row.chips))));
        div.appendChild(who);
        if (e && e.cards.length) {
          const wrap = el('div', 'res-hand');
          wrap.append(miniCards(e.cards), el('span', 'hn', e.name));
          div.appendChild(wrap);
        } else div.appendChild(el('div'));
        if (r.type === 'regame') div.appendChild(el('div', 'delta'));
        else div.appendChild(el('div', 'delta ' + (row.delta > 0 ? 'plus' : row.delta < 0 ? 'minus' : ''), (row.delta > 0 ? '+' : '') + fmt(row.delta)));
        list.appendChild(div);
      });
      modal.classList.add('open');
    }
    $('#resultBtn').textContent = view.iAmReady ? '다른 사람 기다리는 중' : (r.type === 'regame' ? '재경기 준비' : '확인');
    $('#resultBtn').disabled = !!view.iAmReady || view.mySeat == null;
  }
  $('#resultBtn').onclick = () => send({ t: 'ready' });

  function renderOver() {
    const m = $('#overModal');
    if (view.status !== 'over') { m.classList.remove('open'); return; }
    const list = $('#overList');
    list.innerHTML = '';
    (view.ranking || []).forEach((p, i) => {
      const r = el('div', 'res-row' + (i === 0 ? ' win' : ''));
      r.append(el('div', 'who', `${i + 1}위 · ${p.name}`), el('div'), el('div', 'delta', fmt(p.chips)));
      list.appendChild(r);
    });
    $('#restartBtn').style.display = view.isHost ? '' : 'none';
    $('#overHint').textContent = view.isHost ? '다시 하기를 누르면 지금 인원으로 대기실로 돌아갑니다.' : '방장이 다시 하기를 누르면 대기실로 돌아갑니다.';
    m.classList.add('open');
  }

  function render() {
    if (!view) return;
    if (view.status === 'lobby') {
      document.querySelectorAll('#resultModal, #overModal').forEach((o) => o.classList.remove('open'));
      promptKey = null;
      renderLobby();
    } else renderTable();
  }

  // 남은 시간 표시
  setInterval(() => {
    if (!view || !view.game) return;
    const bar = $('#timerBar');
    const pr = view.prompt;
    if (pr && pr.deadline) {
      const total = view.settings.turnSeconds * 1000;
      const left = Math.max(0, pr.deadline - serverNow());
      bar.style.width = Math.min(100, (left / total) * 100) + '%';
      bar.classList.toggle('low', left < 5000);
    } else bar.style.width = '0%';
    if (view.turnDeadline) {
      const t = document.querySelector('.seat.turn .seat-timer');
      if (t) t.textContent = Math.max(0, Math.ceil((view.turnDeadline - serverNow()) / 1000)) + '초';
    }
    if (view.result && view.nextAt) {
      const s = Math.max(0, Math.ceil((view.nextAt - serverNow()) / 1000));
      $('#resultCountdown').textContent = view.result.gameOver ? '' : `${s}초 뒤 ${view.result.type === 'regame' ? '재경기' : '다음 판'}을 시작합니다`;
    }
  }, 250);

  /* ── 기타 이벤트 */
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) $('#' + open.dataset.open).classList.add('open');
    const close = e.target.closest('[data-close]');
    if (close) $('#' + close.dataset.close).classList.remove('open');
    if (e.target.id === 'rules') $('#rules').classList.remove('open');
  });
  window.addEventListener('resize', () => { if (view && view.game) { promptKey = null; renderTable(); } });

  /* ── 시작 */
  fillRules('#rankTable', '#specialTable');
  $('#nameInput').value = store.name;
  const qRoom = new URLSearchParams(location.search).get('room');
  if (qRoom) $('#codeInput').value = qRoom.toUpperCase().slice(0, 4);
  if (store.room) {
    // 새로고침: 자동으로 같은 방에 재접속
    connect();
  } else if (qRoom && store.name) {
    $('#codeInput').focus();
  }
  window.__online = { get view() { return view; } };
})();
