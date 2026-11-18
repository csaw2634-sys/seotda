/*
 * 컴퓨터 플레이어. 자기 패와 공개된 베팅 정보만 보고 판단합니다.
 */
(function (root) {
  'use strict';
  const Core = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.SeotdaCore;

  /** 족보를 0~1 사이 체감 강도로 환산 */
  function strength(hand) {
    const r = hand.rank;
    if (hand.special === 'ddaengjabi') return 0.33;
    if (hand.special === 'amhaeng') return 0.30;
    if (hand.special === 'meonggusa') return 0.42;
    if (hand.special === 'gusa') return 0.38;
    if (r >= 1000) return 1.0;
    if (r >= 900) return 0.97;
    if (r === 810) return 0.95;
    if (r >= 801) return 0.80 + (r - 800) * 0.015; // 삥땡 0.815 ~ 9땡 0.935
    if (r >= 701) return 0.69 + (r - 700) * 0.012; // 세륙 0.702 ~ 알리 0.762
    const k = r - 600; // 끗
    if (k === 0) return 0.08;
    return 0.15 + k * 0.05; // 1끗 0.2 ~ 갑오 0.6
  }

  /** 3장일 때 실제로 남길 2장 선택 (특수패는 상황 봐서) */
  function chooseKeep(cards, ctx) {
    const opts = Core.pairOptions(cards);
    const numAlive = (ctx && ctx.numAlive) || 2;
    const potHeat = ctx && ctx.pot && ctx.ante ? ctx.pot / (ctx.ante * Math.max(2, numAlive)) : 1;
    let best = null, bestScore = -1;
    for (const o of opts) {
      let s = strength(o.hand);
      // 판이 뜨거우면(누군가 큰 패를 들었을 가능성) 땡잡이·암행어사 가치를 올림
      if (o.hand.special === 'ddaengjabi') s = 0.30 + Math.min(0.35, potHeat * 0.05) + numAlive * 0.02;
      if (o.hand.special === 'amhaeng') s = 0.22 + Math.min(0.2, potHeat * 0.02);
      // 구사류는 약한 패로 버티느니 재경기를 노리는 선택
      if (o.hand.special === 'gusa') s = 0.41 + (numAlive >= 3 ? 0.03 : 0);
      if (o.hand.special === 'meonggusa') s = 0.52;
      if (s > bestScore) { bestScore = s; best = o; }
    }
    return best;
  }

  /**
   * ctx: { cards, round, toCall, currentBet, pot, chips, numAlive, options, ante, personality }
   * options: { check, call, bbing, ddadang, half } — 가능한 액션별 지불액(null 이면 불가)
   */
  function decide(ctx) {
    const rnd = Math.random();
    const pers = ctx.personality || 0.5; // 0 = 소심, 1 = 공격적
    let s;
    if (ctx.cards.length === 2 && ctx.round === 1) {
      // 한 장 더 받으므로 기대치 보정
      const h = Core.evaluate(ctx.cards[0], ctx.cards[1]);
      s = strength(h);
      s = s + (1 - s) * 0.18;
    } else {
      const keep = ctx.kept || chooseKeep(ctx.cards, ctx).keep.map((i) => ctx.cards[i]);
      s = strength(Core.evaluate(keep[0], keep[1]));
    }
    // 상대가 많을수록 요구 강도 상승
    const crowd = (ctx.numAlive - 2) * 0.035;
    const o = ctx.options;
    const bluff = rnd < 0.06 + pers * 0.08;

    const raise = (strong) => {
      if (strong && o.half != null) return { type: 'half' };
      if (o.ddadang != null) return { type: 'ddadang' };
      if (o.bbing != null) return { type: 'bbing' };
      if (o.half != null) return { type: 'half' };
      return null;
    };

    if (ctx.toCall === 0) {
      if (s > 0.86 - pers * 0.05 && Math.random() < 0.8) return raise(true) || { type: 'check' };
      if (s > 0.68 + crowd && Math.random() < 0.55 + pers * 0.2) return raise(false) || { type: 'check' };
      if (bluff) return raise(false) || { type: 'check' };
      return { type: 'check' };
    }

    const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
    const need = 0.28 + potOdds * 0.75 + crowd - pers * 0.06 - (ctx.round === 1 ? 0.06 : 0);
    // 올인을 요구받으면 더 신중하게
    const allInPenalty = ctx.toCall >= ctx.chips ? 0.08 : 0;

    if (s < need + allInPenalty && !bluff) return { type: 'die' };
    if (s > 0.88 && Math.random() < 0.65) return raise(true) || { type: 'call' };
    if (s > 0.74 + crowd && Math.random() < 0.3 + pers * 0.2) return raise(false) || { type: 'call' };
    if (bluff && Math.random() < 0.4) return raise(false) || { type: 'call' };
    return { type: 'call' };
  }

  const api = { decide, chooseKeep, strength };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeotdaAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
