// node test/test.js
const assert = require('assert');
const Core = require('../public/js/core.js');
const AI = require('../public/js/ai.js');
const { SeotdaGame } = require('../public/js/game.js');

const C = (m, k) => ({ id: m + '-' + k, month: m, kind: k });
const ev = (a, b) => Core.evaluate(a, b);

// ── 족보
assert.strictEqual(ev(C(3, 'gwang'), C(8, 'gwang')).name, '38광땡');
assert.strictEqual(ev(C(8, 'gwang'), C(1, 'gwang')).name, '18광땡');
assert.strictEqual(ev(C(1, 'gwang'), C(3, 'gwang')).name, '13광땡');
assert.strictEqual(ev(C(1, 'gwang'), C(3, 'tti')).name, '4끗');
assert.strictEqual(ev(C(10, 'yeol'), C(10, 'tti')).name, '장땡');
assert.strictEqual(ev(C(1, 'gwang'), C(1, 'tti')).name, '삥땡');
assert.strictEqual(ev(C(2, 'tti'), C(1, 'tti')).name, '알리');
assert.strictEqual(ev(C(1, 'tti'), C(4, 'tti')).name, '독사');
assert.strictEqual(ev(C(9, 'tti'), C(1, 'tti')).name, '구삥');
assert.strictEqual(ev(C(1, 'tti'), C(10, 'tti')).name, '장삥');
assert.strictEqual(ev(C(10, 'tti'), C(4, 'tti')).name, '장사');
assert.strictEqual(ev(C(6, 'tti'), C(4, 'tti')).name, '세륙');
assert.strictEqual(ev(C(2, 'tti'), C(7, 'tti')).name, '갑오');
assert.strictEqual(ev(C(2, 'tti'), C(8, 'gwang')).name, '망통');
assert.strictEqual(ev(C(3, 'gwang'), C(7, 'yeol')).special, 'ddaengjabi');
assert.strictEqual(ev(C(3, 'tti'), C(7, 'yeol')).special, undefined);
assert.strictEqual(ev(C(7, 'yeol'), C(4, 'yeol')).special, 'amhaeng');
assert.strictEqual(ev(C(4, 'yeol'), C(9, 'yeol')).special, 'meonggusa');
assert.strictEqual(ev(C(4, 'tti'), C(9, 'yeol')).special, 'gusa');
assert(ev(C(3, 'gwang'), C(8, 'gwang')).rank > ev(C(1, 'gwang'), C(8, 'gwang')).rank);
assert(ev(C(1, 'gwang'), C(8, 'gwang')).rank > ev(C(10, 'yeol'), C(10, 'tti')).rank);
assert(ev(C(9, 'yeol'), C(9, 'tti')).rank > ev(C(1, 'tti'), C(2, 'tti')).rank);
assert(ev(C(4, 'tti'), C(6, 'tti')).rank > ev(C(2, 'tti'), C(7, 'tti')).rank);

// 모든 쌍이 평가되는지
const deck = Core.makeDeck();
assert.strictEqual(deck.length, 20);
let pairs = 0;
for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) { const h = ev(deck[i], deck[j]); assert(h.name && h.rank >= 600); pairs++; }
assert.strictEqual(pairs, 190);

// ── 특수패 판정
const E = (id, a, b) => ({ id, hand: ev(a, b) });
let r = Core.resolve([E(0, C(3, 'gwang'), C(7, 'yeol')), E(1, C(9, 'yeol'), C(9, 'tti'))]);
assert.deepStrictEqual(r.winners, [0], '땡잡이가 9땡을 잡아야 함');
r = Core.resolve([E(0, C(3, 'gwang'), C(7, 'yeol')), E(1, C(10, 'yeol'), C(10, 'tti'))]);
assert.deepStrictEqual(r.winners, [1], '땡잡이는 장땡을 못 잡음');
r = Core.resolve([E(0, C(3, 'gwang'), C(7, 'yeol')), E(1, C(1, 'tti'), C(2, 'tti'))]);
assert.deepStrictEqual(r.winners, [1], '땡이 없으면 땡잡이는 망통');
r = Core.resolve([E(0, C(4, 'yeol'), C(7, 'yeol')), E(1, C(1, 'gwang'), C(8, 'gwang'))]);
assert.deepStrictEqual(r.winners, [0], '암행어사가 18광땡을 잡아야 함');
r = Core.resolve([E(0, C(4, 'yeol'), C(7, 'yeol')), E(1, C(3, 'gwang'), C(8, 'gwang'))]);
assert.deepStrictEqual(r.winners, [1], '암행어사는 38광땡 못 잡음');
r = Core.resolve([E(0, C(1, 'gwang'), C(3, 'gwang')), E(1, C(1, 'tti'), C(8, 'gwang'))]);
assert.deepStrictEqual(r.winners, [0]);
r = Core.resolve([E(0, C(1, 'gwang'), C(3, 'gwang')), E(1, C(1, 'gwang'), C(8, 'gwang'))]);
assert.deepStrictEqual(r.winners, [1], '18광땡 > 13광땡');
r = Core.resolve([E(0, C(4, 'yeol'), C(7, 'yeol')), E(1, C(1, 'gwang'), C(3, 'gwang'))]);
assert.deepStrictEqual(r.winners, [0], '암행어사가 13광땡도 잡음');
assert(ev(C(3, 'gwang'), C(8, 'gwang')).rank > ev(C(8, 'gwang'), C(1, 'gwang')).rank && ev(C(8, 'gwang'), C(1, 'gwang')).rank > ev(C(1, 'gwang'), C(3, 'gwang')).rank);
r = Core.resolve([E(0, C(2, 'tti'), C(5, 'tti')), E(1, C(3, 'tti'), C(4, 'tti'))]);
assert.deepStrictEqual(r.winners, [0, 1], '같은 7끗은 무승부');

// 재경기
assert.strictEqual(Core.checkRegame([E(0, C(4, 'tti'), C(9, 'yeol')), E(1, C(1, 'tti'), C(2, 'tti'))]).reason, '구사');
assert.strictEqual(Core.checkRegame([E(0, C(4, 'tti'), C(9, 'yeol')), E(1, C(5, 'tti'), C(5, 'yeol'))]), null);
assert.strictEqual(Core.checkRegame([E(0, C(4, 'yeol'), C(9, 'yeol')), E(1, C(8, 'gwang'), C(8, 'yeol'))]).reason, '멍텅구리구사');
assert.strictEqual(Core.checkRegame([E(0, C(4, 'yeol'), C(9, 'yeol')), E(1, C(5, 'tti'), C(5, 'yeol'))]).reason, '멍텅구리구사');
assert.strictEqual(Core.checkRegame([E(0, C(4, 'yeol'), C(9, 'yeol')), E(1, C(10, 'tti'), C(10, 'yeol'))]), null);

// ── 사이드팟: 0번 올인 100, 1·2번 300 베팅, 0번이 최고패
let s = Core.settle({ 0: 100, 1: 300, 2: 300 }, [
  E(0, C(10, 'yeol'), C(10, 'tti')), E(1, C(1, 'tti'), C(2, 'tti')), E(2, C(2, 'tti'), C(7, 'tti')),
], [0, 1, 2]);
assert.deepStrictEqual(s.payout, { 0: 300, 1: 400, 2: 0 });
// 다이한 사람 돈 포함
s = Core.settle({ 0: 200, 1: 200, 2: 150 }, [E(0, C(2, 'tti'), C(7, 'tti')), E(1, C(1, 'tti'), C(2, 'tti'))], [0, 1, 2]);
assert.deepStrictEqual(s.payout, { 0: 0, 1: 550, 2: 0 });
// 무승부 나머지 칩
s = Core.settle({ 0: 101, 1: 101, 2: 101 }, [E(0, C(2, 'tti'), C(5, 'tti')), E(1, C(3, 'tti'), C(4, 'tti'))], [1, 2, 0]);
assert.strictEqual(s.payout[0] + s.payout[1], 303);
assert.strictEqual(s.payout[1], 152);

// 3장 옵션
const opts = Core.pairOptions([C(1, 'gwang'), C(5, 'tti'), C(8, 'gwang')]);
assert.strictEqual(opts.length, 3);
assert.strictEqual(Core.bestOption([C(1, 'gwang'), C(5, 'tti'), C(8, 'gwang')]).hand.name, '18광땡');

console.log('단위 테스트 통과');

// ── AI 끼리 시뮬레이션: 칩 총량 보존, 무한루프 없음
(async () => {
  let regames = 0, hands = 0, games = 0;
  const kinds = {};
  for (let g = 0; g < 300; g++) {
    const n = 2 + (g % 4); // 2~5인
    const game = new SeotdaGame({
      ante: 100, startChips: 3000,
      players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, isHuman: false })),
    }, {
      decide: async (p, ctx) => AI.decide(ctx),
      discard: async (p, ctx) => AI.chooseKeep(ctx.cards, ctx).discard,
      regame: async () => { regames++; },
    });
    const total = n * 3000;
    let guard = 0;
    while (!game.isOver() && guard++ < 400) {
      const res = await game.playHand();
      hands++;
      (res.entries || []).forEach((e) => { kinds[e.hand.name] = (kinds[e.hand.name] || 0) + 1; });
      const sum = game.players.reduce((a, p) => a + p.chips, 0);
      assert.strictEqual(sum, total, `칩 보존 실패: ${sum} != ${total}`);
      game.players.forEach((p) => assert(p.chips >= 0));
    }
    games++;
  }
  console.log(`시뮬레이션 ${games}게임 / ${hands}판 / 재경기 ${regames}회 — 칩 총량 보존 OK`);
  console.log('쇼다운 족보 분포 상위:', Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ':' + v).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
