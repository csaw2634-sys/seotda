// 온라인 서버 통합 테스트: node test/online-test.js
// 사람 클라이언트 4명(+봇 1) — 중간 이탈·재접속·난입 포함
process.env.PORT = process.env.PORT || '3999';
process.env.SEOTDA_BOT_SPEED = '20';
const assert = require('assert');
const WebSocket = require('ws');
const { server, rooms } = require('../server/server.js');
const URL = `ws://localhost:${process.env.PORT}/ws`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12) + 'xyz';

class Client {
  constructor(name) { this.name = name; this.token = rid(); this.view = null; this.errors = []; this.leaks = 0; this.actions = 0; }
  connect() {
    return new Promise((res) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', res);
      this.ws.on('message', (raw) => this.onMsg(JSON.parse(raw)));
    });
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  onMsg(m) {
    if (m.t === 'joined') this.code = m.code;
    if (m.t === 'error') this.errors.push(m.msg);
    if (m.t !== 'state') return;
    const v = this.view = m.view;
    if (v.game) {
      const revealed = v.result && (v.result.type === 'showdown' || v.result.type === 'regame');
      v.game.players.forEach((p) => {
        if (!p.isMe && !revealed && p.cards.some((c) => c)) this.leaks++;
      });
    }
    if (v.prompt && !this.paused) {
      const pk = JSON.stringify([v.prompt.kind, v.prompt.deadline, v.game.handNo, v.game.phase]);
      if (pk === this.lastPrompt) return;
      this.lastPrompt = pk;
      setTimeout(() => {
        if (v.prompt.kind === 'discard') {
          const ch = v.prompt.choices[Math.floor(Math.random() * 3)];
          this.send({ t: 'discard', index: ch.discard });
        } else {
          const types = Object.keys(v.prompt.options).filter((k) => v.prompt.options[k] != null && (k !== 'die' || Math.random() < 0.15) && (k !== 'half' || Math.random() < 0.3));
          this.send({ t: 'action', type: types[Math.floor(Math.random() * types.length)] });
        }
        this.actions++;
      }, 5);
    }
    if (v.result && !v.iAmReady) this.send({ t: 'ready' });
  }
}

(async () => {
  const A = new Client('철수'), B = new Client('영희'), C = new Client('민수'), D = new Client('지영');
  await A.connect();
  A.send({ t: 'create', name: A.name, token: A.token, settings: { startChips: 20000, ante: 100, turnSeconds: 10 } });
  await sleep(200);
  assert(A.code, '방 코드 없음');
  console.log('방 코드', A.code);
  await B.connect(); B.send({ t: 'join', code: A.code.toLowerCase(), name: B.name, token: B.token });
  await C.connect(); C.send({ t: 'join', code: A.code, name: C.name, token: C.token });
  await sleep(200);
  B.send({ t: 'start' }); // 방장 아님 → 무시/에러
  A.send({ t: 'addBot' });
  await sleep(200);
  assert.strictEqual(A.view.lobby.length, 4);
  assert(A.view.isHost && !B.view.isHost);
  // 없는 방
  const X = new Client('x'); await X.connect(); X.send({ t: 'join', code: 'ZZZZ', name: 'x', token: X.token }); await sleep(100);
  assert(X.errors.length === 1, '없는 방 에러');
  X.ws.close();

  A.send({ t: 'start' });
  await sleep(100);
  assert.strictEqual(A.view.status, 'playing');

  // 3판쯤 지나서 C 연결 끊김 → 재접속
  while (A.view.game.handNo < 3) await sleep(50);
  C.paused = true; C.ws.terminate();
  await sleep(1500);
  const cSeat = A.view.game.players.find((p) => p.name === '민수');
  assert(cSeat && !cSeat.connected, '끊김 표시');
  C.paused = false; await C.connect(); C.send({ t: 'join', code: A.code, name: C.name, token: C.token });
  await sleep(300);
  assert(C.view.mySeat != null, '재접속 후 자리 유지');

  // D 난입 (다음 판부터)
  await D.connect(); D.send({ t: 'join', code: A.code, name: D.name, token: D.token });
  await sleep(200);
  assert(D.view.waiting || D.view.mySeat != null);
  const start = A.view.game.handNo;
  while (A.view.status === 'playing' && A.view.game.handNo < start + 2) await sleep(50);
  if (A.view.status === 'playing') assert(D.view.mySeat != null, '난입자 착석');

  // B 나가기
  B.send({ t: 'leave' });
  await sleep(300);

  // 게임 끝날 때까지 (최대 60초)
  const t0 = Date.now();
  while (A.view.status === 'playing' && Date.now() - t0 < 60000) await sleep(100);
  console.log('상태', A.view.status, '판 수', A.view.game.handNo, '순위', JSON.stringify(A.view.ranking));
  const all = [A, C, D];
  all.forEach((c) => assert.strictEqual(c.leaks, 0, c.name + ' 남의 패 노출'));
  console.log('행동 수', all.map((c) => c.name + ':' + c.actions).join(' '), '/ 패 노출 0건');

  if (A.view.status === 'over') {
    A.send({ t: 'restart' });
    await sleep(300);
    assert.strictEqual(A.view.status, 'lobby');
    console.log('다시 하기 → 대기실', A.view.lobby.map((s) => s.name).join(', '));
  }
  console.log('온라인 테스트 통과');
  [A, C, D].forEach((c) => c.ws.close());
  server.close(); process.exit(0);
})().catch((e) => { console.error('실패:', e); process.exit(1); });
