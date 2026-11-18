/*
 * 섯다 코어: 덱, 족보 판정, 특수패(땡잡이·암행어사·구사·멍텅구리구사), 사이드팟 정산
 * 브라우저에서는 window.SeotdaCore, Node 에서는 module.exports 로 사용합니다.
 */
(function (root) {
  'use strict';

  const MONTH_NAMES = {
    1: '송학', 2: '매조', 3: '벚꽃', 4: '흑싸리', 5: '난초',
    6: '모란', 7: '홍싸리', 8: '공산', 9: '국진', 10: '단풍',
  };

  // 섯다용 20장: 1~10월 각 2장. kind = gwang(광) | yeol(열끗) | tti(띠/피)
  const DECK_DEF = [
    [1, 'gwang'], [1, 'tti'],
    [2, 'yeol'], [2, 'tti'],
    [3, 'gwang'], [3, 'tti'],
    [4, 'yeol'], [4, 'tti'],
    [5, 'yeol'], [5, 'tti'],
    [6, 'yeol'], [6, 'tti'],
    [7, 'yeol'], [7, 'tti'],
    [8, 'gwang'], [8, 'yeol'],
    [9, 'yeol'], [9, 'tti'],
    [10, 'yeol'], [10, 'tti'],
  ];

  function makeDeck() {
    return DECK_DEF.map(([month, kind]) => ({ id: month + '-' + kind, month, kind }));
  }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function cardLabel(c) {
    const k = c.kind === 'gwang' ? '광' : c.kind === 'yeol' ? '열끗' : '';
    return c.month + '월' + k;
  }

  /*
   * 족보 점수 (rank)
   *  1000      38광땡
   *   910      18광땡
   *   900      13광땡
   *   801~810  1땡(삥땡) ~ 장땡
   *   701~706  세륙 < 장사 < 장삥 < 구삥 < 독사 < 알리
   *   600~609  망통(0끗) ~ 갑오(9끗)
   * 특수패는 기본 점수를 갖고 special 플래그로 쇼다운에서 추가 처리됩니다.
   *   땡잡이(3광+7열끗)      = 망통(600), 상대 최고패가 1~9땡이면 승리
   *   암행어사(4열끗+7열끗)  = 1끗(601),  상대 최고패가 13·18광땡이면 승리
   *   구사(4+9)              = 3끗(603),  최고패가 알리 이하면 재경기
   *   멍텅구리구사(4열끗+9열끗) = 3끗(603), 최고패가 9땡 이하면 재경기
   */
  const MIDDLE = {
    '1,2': [706, '알리'],
    '1,4': [705, '독사'],
    '1,9': [704, '구삥'],
    '1,10': [703, '장삥'],
    '4,10': [702, '장사'],
    '4,6': [701, '세륙'],
  };

  function evaluate(a, b) {
    const [x, y] = a.month <= b.month ? [a, b] : [b, a];
    const m1 = x.month, m2 = y.month;
    const G = (c) => c.kind === 'gwang';
    const Y = (c) => c.kind === 'yeol';

    if (G(x) && G(y)) {
      if (m1 === 3 && m2 === 8) return { rank: 1000, name: '38광땡', tier: 'gwangttaeng' };
      if (m1 === 1 && m2 === 8) return { rank: 910, name: '18광땡', tier: 'gwangttaeng' };
      if (m1 === 1 && m2 === 3) return { rank: 900, name: '13광땡', tier: 'gwangttaeng' };
    }
    if (m1 === 3 && m2 === 7 && G(x) && Y(y)) return { rank: 600, name: '땡잡이', tier: 'kkeut', special: 'ddaengjabi' };
    if (m1 === 4 && m2 === 7 && Y(x) && Y(y)) return { rank: 601, name: '암행어사', tier: 'kkeut', special: 'amhaeng' };
    if (m1 === 4 && m2 === 9 && Y(x) && Y(y)) return { rank: 603, name: '멍텅구리구사', tier: 'kkeut', special: 'meonggusa' };
    if (m1 === 4 && m2 === 9) return { rank: 603, name: '구사', tier: 'kkeut', special: 'gusa' };

    if (m1 === m2) {
      const name = m1 === 10 ? '장땡' : m1 === 1 ? '삥땡' : m1 + '땡';
      return { rank: 800 + m1, name, tier: 'ttaeng' };
    }
    const mid = MIDDLE[m1 + ',' + m2];
    if (mid) return { rank: mid[0], name: mid[1], tier: 'middle' };

    const k = (m1 + m2) % 10;
    const name = k === 9 ? '갑오' : k === 0 ? '망통' : k + '끗';
    return { rank: 600 + k, name, tier: 'kkeut' };
  }

  /** 3장 중 2장 고르는 3가지 경우. keep = 남길 두 장의 인덱스, discard = 버릴 인덱스 */
  function pairOptions(cards) {
    if (cards.length === 2) return [{ keep: [0, 1], discard: -1, hand: evaluate(cards[0], cards[1]) }];
    const out = [];
    for (let d = 0; d < cards.length; d++) {
      const keep = [0, 1, 2].filter((i) => i !== d);
      out.push({ keep, discard: d, hand: evaluate(cards[keep[0]], cards[keep[1]]) });
    }
    return out;
  }

  function bestOption(cards) {
    return pairOptions(cards).reduce((best, o) => (o.hand.rank > best.hand.rank ? o : best));
  }

  /** 쇼다운 직전 재경기 여부. entries = [{id, hand}] (살아있는 플레이어 전원) */
  function checkRegame(entries) {
    if (entries.length < 2) return null;
    const top = Math.max(...entries.map((e) => e.hand.rank));
    const meong = entries.find((e) => e.hand.special === 'meonggusa');
    if (meong && top <= 809) return { reason: '멍텅구리구사', id: meong.id };
    const gusa = entries.find((e) => e.hand.special === 'gusa');
    if (gusa && top <= 706) return { reason: '구사', id: gusa.id };
    return null;
  }

  /** 특수패를 반영해 승자 결정. 반환: {winners:[id], effective:{id:rank}, notes:[]} */
  function resolve(entries) {
    const top = Math.max(...entries.map((e) => e.hand.rank));
    const effective = {};
    const notes = [];
    entries.forEach((e) => { effective[e.id] = e.hand.rank; });
    if (top >= 801 && top <= 809) {
      const dj = entries.find((e) => e.hand.special === 'ddaengjabi');
      if (dj) { effective[dj.id] = 1001; notes.push('땡잡이가 땡을 잡았습니다!'); }
    }
    if (top >= 900 && top < 1000) {
      const am = entries.find((e) => e.hand.special === 'amhaeng');
      if (am) { effective[am.id] = 1001; notes.push('암행어사가 광땡을 잡았습니다!'); }
    }
    const best = Math.max(...Object.values(effective));
    const winners = entries.filter((e) => effective[e.id] === best).map((e) => e.id);
    return { winners, effective, notes };
  }

  /**
   * 사이드팟 정산.
   * contribs: {id: 이번 판 총 베팅액} (다이한 사람 포함)
   * entries : 쇼다운에 남은 [{id, hand}]
   * order   : 나머지 칩 배분 우선순위 (선부터 좌석 순서의 id 배열)
   */
  function settle(contribs, entries, order) {
    const payout = {};
    Object.keys(contribs).forEach((id) => { payout[id] = 0; });
    const levels = [...new Set(entries.map((e) => contribs[e.id]))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    const notes = [];
    for (const lv of levels) {
      let amount = 0;
      for (const id of Object.keys(contribs)) {
        amount += Math.max(0, Math.min(contribs[id], lv) - prev);
      }
      const eligible = entries.filter((e) => contribs[e.id] >= lv);
      if (amount > 0) {
        const r = resolve(eligible);
        r.notes.forEach((n) => { if (!notes.includes(n)) notes.push(n); });
        const share = Math.floor(amount / r.winners.length);
        let rest = amount - share * r.winners.length;
        r.winners.forEach((id) => { payout[id] += share; });
        if (rest > 0) {
          const first = order.find((id) => r.winners.includes(id));
          payout[first] += rest;
        }
        pots.push({ amount, winners: r.winners, eligible: eligible.map((e) => e.id) });
      }
      prev = lv;
    }
    // 아무도 받아주지 못한 초과분은 본인에게 반환
    for (const id of Object.keys(contribs)) {
      const excess = contribs[id] - prev;
      if (excess > 0) payout[id] += excess;
    }
    return { payout, pots, notes };
  }

  const RANKING_TABLE = [
    ['38광땡', '3월광 + 8월광', '최강의 패'],
    ['18광땡', '1월광 + 8월광', ''],
    ['13광땡', '1월광 + 3월광', ''],
    ['장땡', '10월 + 10월', '땡 중 최고'],
    ['9땡 ~ 삥땡', '같은 월 두 장', '숫자가 클수록 높음'],
    ['알리', '1월 + 2월', ''],
    ['독사', '1월 + 4월', ''],
    ['구삥', '1월 + 9월', ''],
    ['장삥', '1월 + 10월', ''],
    ['장사', '4월 + 10월', ''],
    ['세륙', '4월 + 6월', ''],
    ['갑오 ~ 1끗', '두 장 합의 일의 자리', '갑오 = 9끗'],
    ['망통', '합의 일의 자리 0', '최하위'],
  ];

  const SPECIAL_TABLE = [
    ['땡잡이', '3월광 + 7월열끗', '상대 최고패가 1~9땡이면 승리 (장땡·광땡은 못 잡음). 아니면 망통'],
    ['암행어사', '4월열끗 + 7월열끗', '상대 최고패가 13·18광땡이면 승리. 아니면 1끗'],
    ['구사', '4월 + 9월', '최고패가 알리 이하면 재경기. 아니면 3끗'],
    ['멍텅구리구사', '4월열끗 + 9월열끗', '최고패가 9땡 이하면 재경기. 아니면 3끗'],
  ];

  const api = {
    MONTH_NAMES, makeDeck, shuffle, cardLabel, evaluate, pairOptions, bestOption,
    checkRegame, resolve, settle, RANKING_TABLE, SPECIAL_TABLE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeotdaCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
