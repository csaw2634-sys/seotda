/*
 * 세장섯다 온라인 서버
 *   - public/ 폴더의 화면 파일을 그대로 서비스
 *   - /ws 경로로 WebSocket 접속 → 방 만들기/참가/게임 진행
 * 실행: npm install && npm start  (기본 포트 3000, PORT 환경변수로 변경)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Room } = require('./room.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// 다른 곳(예: GitHub Pages)에 올린 화면에서 접속을 허용할 주소. 쉼표로 여러 개. 비우면 모두 허용.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(I, O, 0, 1) 제외
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += chars[crypto.randomInt(chars.length)];
    if (!rooms.has(c)) return c;
  }
}

/* ── 정적 파일 */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok ' + rooms.size);
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

/* ── WebSocket */
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 4 * 1024,
  verifyClient: (info) => !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(info.origin),
});

const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8) || '손님';
const cleanToken = (t) => (typeof t === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(t) ? t : null);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null;
  let token = null;

  const send = (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'create' || msg.t === 'join') {
      const tk = cleanToken(msg.token);
      if (!tk) return send({ t: 'error', msg: '잘못된 접속 정보입니다. 새로고침 해주세요.' });
      if (room) room.disconnect(ws);
      let r;
      if (msg.t === 'create') {
        const code = makeCode();
        r = new Room(code, (c) => rooms.delete(c));
        rooms.set(code, r);
        r.applySettings(msg.settings);
      } else {
        r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return send({ t: 'error', msg: '그런 방이 없습니다. 코드를 확인해주세요.', code: 'NO_ROOM' });
      }
      const result = r.join(ws, tk, cleanName(msg.name));
      if (result.error) {
        if (msg.t === 'create') rooms.delete(r.code);
        return send({ t: 'error', msg: result.error });
      }
      room = r; token = tk;
      return send({ t: 'joined', code: r.code });
    }

    if (!room) return;
    switch (msg.t) {
      case 'leave': room.leave(token); room = null; break;
      case 'addBot': room.addBot(token); break;
      case 'removeBot': room.removeBot(token, Number(msg.index)); break;
      case 'settings': room.updateSettings(token, msg.settings); break;
      case 'start': { const r = room.start(token); if (r.error) send({ t: 'error', msg: r.error }); break; }
      case 'restart': room.restart(token); break;
      case 'action':
      case 'discard': room.handleAction(token, msg); break;
      case 'ready': room.ready(token); break;
      case 'chat': room.addChat(token, msg.text); break;
      default: break;
    }
  });

  ws.on('close', () => { if (room) room.disconnect(ws); });
  ws.on('error', () => {});
});

// 끊긴 연결 감지 (모바일 절전 등)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* noop */ }
  }
}, 25000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`세장섯다 서버 실행 중: http://localhost:${PORT}`);
});

module.exports = { server, rooms };
