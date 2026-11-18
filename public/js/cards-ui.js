/*
 * 화투 카드 그리기 (오프라인·온라인 공용)
 * 한국 화투 느낌으로 SVG 를 직접 그립니다.
 *  - 광: 구석에 光 표시
 *  - 일본판의 녹색 → 검정 (솔, 흑싸리, 공산 등)
 *  - 띠: 홍단(1·2·3월) / 초단(4·5·7월, 글씨 없음) / 청단(6·9·10월)
 *  - 월마다 식물 그림이 달라 띠 색이 같아도 한눈에 구분됩니다.
 */
(function () {
  'use strict';
  const Core = window.SeotdaCore;

  const K = '#161414';   // 검정
  const R = '#d4221a';   // 빨강
  const RD = '#9c140e';  // 진빨강
  const B = '#1d4fae';   // 파랑
  const W = '#fffdf7';   // 흰색
  const Y = '#f1bf2a';   // 노랑
  const BR = '#6e3b1c';  // 갈색
  const PK = '#f6b3c4';  // 분홍
  const PU = '#3b4fb8';  // 붓꽃 청보라

  /* ── 공용 도형 */
  const blossom = (cx, cy, r, petal, center, n = 5) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      s += `<circle cx="${(cx + Math.cos(a) * r * 0.55).toFixed(2)}" cy="${(cy + Math.sin(a) * r * 0.55).toFixed(2)}" r="${(r * 0.5).toFixed(2)}" fill="${petal}"/>`;
    }
    return s + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.32).toFixed(2)}" fill="${center}"/>`;
  };
  const cloud = (cx, cy, r, fill = K) =>
    `<circle cx="${cx - r * 0.9}" cy="${cy + r * 0.2}" r="${r * 0.75}" fill="${fill}"/><circle cx="${cx}" cy="${cy - r * 0.2}" r="${r}" fill="${fill}"/><circle cx="${cx + r * 0.9}" cy="${cy + r * 0.25}" r="${r * 0.7}" fill="${fill}"/>`;
  const maple = (cx, cy, r, fill) => {
    let pts = '';
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 - Math.PI / 2;
      const rr = i % 2 === 0 ? (i === 6 || i === 8 ? r * 0.7 : r) : r * 0.5;
      pts += `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)} `;
    }
    return `<polygon points="${pts}" fill="${fill}" stroke="${RD}" stroke-width=".4"/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + r * 1.3}" stroke="${BR}" stroke-width=".8"/>`;
  };
  const ribbon = (type) => {
    const fill = type === 'cheong' ? B : R;
    const txt = type === 'hong' ? ['홍', '단'] : type === 'cheong' ? ['청', '단'] : null;
    const tc = type === 'cheong' ? W : K;
    return `<g transform="rotate(-14 30 44)">
      <path d="M23.5 12 h13 v50 l-6.5 -5 l-6.5 5z" fill="${fill}" stroke="${K}" stroke-width=".7"/>
      <path d="M23.5 12 h13 v3 h-13z" fill="${RD}" opacity=".5"/>
      ${txt ? `<text x="30" y="29" font-size="8.5" font-weight="700" fill="${tc}" text-anchor="middle" font-family="serif">${txt[0]}</text><text x="30" y="39" font-size="8.5" font-weight="700" fill="${tc}" text-anchor="middle" font-family="serif">${txt[1]}</text>` : ''}
    </g>`;
  };

  /* ── 월별 배경 식물 */
  const PLANT = {
    1: () => `<path d="M10 96 C14 70 12 55 22 40" stroke="${BR}" stroke-width="4" fill="none"/>
      ${cloud(18, 42, 9)}${cloud(42, 58, 10)}${cloud(16, 74, 8)}
      <path d="M28 56 L44 54 M14 72 L30 66" stroke="${BR}" stroke-width="2"/>`,
    2: () => `<path d="M4 90 L18 66 L12 50 L30 34 L26 20 L44 8 M18 66 L40 60 L52 44 M30 34 L48 30" stroke="${K}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>
      ${blossom(26, 20, 6, R, Y)}${blossom(44, 9, 5, R, Y)}${blossom(48, 30, 5.5, R, Y)}${blossom(12, 50, 5.5, R, Y)}${blossom(40, 60, 6, R, Y)}${blossom(52, 44, 5, R, Y)}`,
    3: () => `<path d="M0 30 Q30 22 60 30 L60 36 Q30 28 0 36z" fill="#c9c3b6"/>
      ${blossom(10, 12, 7, PK, R)}${blossom(26, 8, 6, PK, R)}${blossom(42, 14, 7, PK, R)}${blossom(54, 6, 5, PK, R)}
      ${blossom(18, 24, 6, PK, R)}${blossom(48, 26, 6, PK, R)}`,
    4: () => {
      let s = `<path d="M0 6 Q30 14 60 4" stroke="${K}" stroke-width="2.5" fill="none"/>`;
      [10, 22, 36, 50].forEach((x, i) => {
        for (let k = 0; k < 7; k++) s += `<ellipse cx="${x + Math.sin(k + i) * 2}" cy="${12 + k * 7 + (i % 2) * 4}" rx="2.6" ry="3.6" fill="${K}"/>`;
      });
      return s;
    },
    5: () => {
      let s = '';
      [[6, 40, 4], [14, 30, 2], [22, 46, 5], [40, 34, -3], [48, 28, -1], [55, 44, -4]].forEach(([x, top, lean]) => {
        s += `<path d="M${x} 96 Q${x + lean} ${(96 + top) / 2} ${x + lean * 2} ${top} Q${x + lean + 2} ${(96 + top) / 2} ${x + 3} 96z" fill="${K}"/>`;
      });
      const iris = (x, y) => `<path d="M${x} ${y} q-6 -2 -7 -9 q5 1 7 5 q2 -4 7 -5 q-1 7 -7 9z" fill="${PU}"/><path d="M${x} ${y} q-4 4 -9 3 q3 -4 9 -3 q6 -1 9 3 q-5 1 -9 -3z" fill="#5e6fd6"/><circle cx="${x}" cy="${y}" r="1.3" fill="${Y}"/>`;
      s += iris(13, 32) + iris(47, 26) + iris(30, 44);
      return s;
    },
    6: () => `<path d="M8 70 q10 -18 24 -10 q-6 14 -24 10z M52 72 q-10 -18 -24 -10 q6 14 24 10z M18 84 q12 -10 22 0 q-12 8 -22 0z" fill="${K}"/>
      <circle cx="30" cy="54" r="14" fill="${R}"/><circle cx="30" cy="54" r="10" fill="${RD}"/><circle cx="30" cy="54" r="6" fill="${R}"/><circle cx="30" cy="54" r="2.5" fill="${Y}"/>`,
    7: () => {
      let s = `<path d="M6 96 Q10 40 54 18 M20 96 Q26 56 58 46 M2 60 Q20 50 40 70" stroke="${K}" stroke-width="1.6" fill="none"/>`;
      const pts = [[14, 60], [20, 46], [30, 36], [42, 26], [52, 20], [28, 70], [36, 58], [46, 50], [10, 56], [24, 56], [34, 66], [50, 46]];
      pts.forEach(([x, y]) => { s += `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="2" fill="${R}" transform="rotate(-30 ${x} ${y})"/><ellipse cx="${x + 3}" cy="${y + 3}" rx="2.4" ry="1.4" fill="${K}" transform="rotate(20 ${x} ${y})"/>`; });
      return s;
    },
    8: () => `<path d="M0 62 Q30 30 60 62 V96 H0z" fill="${K}"/>
      <path d="M8 62 l3 -8 M18 52 l2 -9 M42 52 l-2 -9 M52 60 l-3 -8" stroke="${W}" stroke-width=".7" opacity=".6"/>`,
    9: () => `<path d="M30 96 Q28 70 34 50 M30 80 Q16 72 10 58 M32 70 Q46 64 50 52" stroke="${K}" stroke-width="2" fill="none"/>
      <path d="M12 76 q-8 -4 -6 -12 q8 2 6 12z M46 70 q8 -4 8 -12 q-8 1 -8 12z" fill="${K}"/>
      ${blossom(34, 46, 13, Y, R, 12)}${blossom(10, 56, 8, Y, R, 10)}${blossom(50, 50, 7, R, Y, 10)}`,
    10: () => `<path d="M60 4 Q36 14 24 40 M40 12 Q50 30 44 52" stroke="${K}" stroke-width="1.8" fill="none"/>
      ${maple(16, 14, 8, R)}${maple(36, 10, 7, R)}${maple(50, 24, 8, R)}${maple(24, 34, 7, Y)}${maple(44, 50, 8, R)}${maple(10, 44, 6, R)}`,
  };

  /* ── 광·열끗 그림 */
  const SPECIAL = {
    1: () => `<circle cx="42" cy="16" r="11" fill="${R}"/>
      <ellipse cx="30" cy="74" rx="13" ry="8" fill="${W}" stroke="${K}" stroke-width=".8"/>
      <path d="M20 72 q-8 4 -12 -2 q6 -2 12 2z" fill="${K}"/>
      <path d="M36 70 Q44 56 40 44" stroke="${W}" stroke-width="3.2" fill="none"/><path d="M36 70 Q44 56 40 44" stroke="${K}" stroke-width=".6" fill="none" transform="translate(1.5 0)"/>
      <circle cx="40" cy="43" r="3.2" fill="${W}" stroke="${K}" stroke-width=".6"/><circle cx="40" cy="40.6" r="1.4" fill="${R}"/>
      <path d="M42.5 43.5 l6 1.2 l-6 .6z" fill="${K}"/>
      <path d="M26 81 l-2 10 M33 81 l1 10" stroke="${K}" stroke-width="1"/>`,
    2: () => `<ellipse cx="34" cy="76" rx="9" ry="6" fill="#9db13a" stroke="${K}" stroke-width=".7"/>
      <circle cx="42" cy="71" r="4.5" fill="#9db13a" stroke="${K}" stroke-width=".7"/><circle cx="43.5" cy="70" r="1" fill="${K}"/>
      <path d="M46 71 l4 1 l-4 1z" fill="${Y}"/><path d="M26 78 l-10 6 l11 -1z" fill="#6f8226"/>
      <path d="M30 74 q4 -6 10 -2" stroke="#6f8226" stroke-width="2" fill="none"/>`,
    3: () => {
      let s = `<path d="M2 58 Q8 52 14 58 Q20 52 26 58 Q32 52 38 58 Q44 52 50 58 Q56 52 60 58 V92 H2z" fill="${W}" stroke="${K}" stroke-width=".8"/>`;
      for (let i = 0; i < 6; i++) s += `<rect x="${4 + i * 9.5}" y="58" width="4.5" height="34" fill="${R}" opacity=".85"/>`;
      s += `<circle cx="30" cy="74" r="7" fill="${W}" stroke="${K}" stroke-width=".8"/>${blossom(30, 74, 5, PK, R)}`;
      return s;
    },
    4: () => `<path d="M46 58 a8 8 0 1 0 8 10 a6 6 0 1 1 -8 -10z" fill="${R}"/>
      <path d="M8 74 Q18 66 28 70 L44 62 L34 74 Q26 80 14 80z" fill="${K}"/>
      <path d="M28 70 l-6 -10 l10 8z M30 72 l2 10 l-6 -6z" fill="${K}"/><circle cx="40" cy="65" r=".9" fill="${W}"/>`,
    5: () => `<path d="M0 80 L20 70 L30 76 L60 64 L60 70 L30 82 L20 76 L0 86z" fill="${BR}" stroke="${K}" stroke-width=".6"/>
      <path d="M8 82 v12 M24 76 v18 M44 72 v22" stroke="${BR}" stroke-width="2"/>`,
    6: () => {
      const bf = (x, y, c) => `<path d="M${x} ${y} q-8 -10 -10 0 q2 6 10 0z M${x} ${y} q8 -10 10 0 q-2 6 -10 0z" fill="${c}" stroke="${K}" stroke-width=".5"/><path d="M${x} ${y} q-6 6 -6 10 q4 0 6 -8 M${x} ${y} q6 6 6 10 q-4 0 -6 -8" fill="${c}" stroke="${K}" stroke-width=".5"/><line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 4}" stroke="${K}" stroke-width="1"/>`;
      return bf(16, 22, Y) + bf(46, 30, B);
    },
    7: () => `<ellipse cx="28" cy="80" rx="16" ry="9" fill="${BR}" stroke="${K}" stroke-width=".8"/>
      <path d="M40 76 l12 2 l-1 6 l-11 2z" fill="${BR}" stroke="${K}" stroke-width=".8"/><circle cx="46" cy="78" r="1" fill="${K}"/>
      <path d="M50 84 q3 1 4 -2" stroke="${W}" stroke-width="1.4" fill="none"/>
      <path d="M18 86 v8 M26 88 v7 M34 88 v7 M40 85 v8" stroke="${K}" stroke-width="2"/>
      <path d="M14 74 q6 -6 20 -4" stroke="${K}" stroke-width="2" fill="none"/>`,
    8: (kind) => (kind === 'gwang'
      ? `<rect x="0" y="0" width="60" height="62" fill="${R}"/><circle cx="30" cy="30" r="15" fill="${W}"/><circle cx="30" cy="30" r="15" fill="none" stroke="${RD}" stroke-width=".8"/>`
      : `<rect x="0" y="0" width="60" height="62" fill="#efd28e"/>
         ${[[14, 16], [30, 10], [44, 22]].map(([x, y]) => `<path d="M${x - 7} ${y + 2} Q${x - 3} ${y - 3} ${x} ${y + 1} Q${x + 3} ${y - 3} ${x + 7} ${y + 2} L${x} ${y + 4}z" fill="${K}"/>`).join('')}`),
    9: () => `<path d="M14 66 h32 l-5 12 h-22z" fill="${R}" stroke="${K}" stroke-width=".8"/><ellipse cx="30" cy="66" rx="16" ry="3" fill="${RD}" stroke="${K}" stroke-width=".6"/>
      <path d="M24 78 h12 l-2 6 h-8z" fill="${R}" stroke="${K}" stroke-width=".6"/>
      <text x="30" y="76" font-size="9" fill="${Y}" text-anchor="middle" font-family="serif" font-weight="700">壽</text>`,
    10: () => `<ellipse cx="28" cy="78" rx="13" ry="8" fill="#b06a2c" stroke="${K}" stroke-width=".8"/>
      <circle cx="24" cy="76" r="1.2" fill="${W}"/><circle cx="30" cy="80" r="1.2" fill="${W}"/><circle cx="20" cy="81" r="1" fill="${W}"/>
      <path d="M38 74 L44 62 L50 64 L46 74z" fill="#b06a2c" stroke="${K}" stroke-width=".8"/><circle cx="46.5" cy="65" r=".9" fill="${K}"/>
      <path d="M44 62 l-4 -8 m2 4 l-4 0 M48 62 l3 -8 m-1.5 4 l4 -1" stroke="${K}" stroke-width="1.2" fill="none"/>
      <path d="M20 85 v9 M26 86 v8 M32 86 v8 M37 84 v9" stroke="${K}" stroke-width="1.8"/>`,
  };

  const RIBBON_TYPE = { 1: 'hong', 2: 'hong', 3: 'hong', 4: 'cho', 5: 'cho', 7: 'cho', 6: 'cheong', 9: 'cheong', 10: 'cheong' };
  const TYPE_LABEL = { gwang: '광', yeol: '열끗', tti: '띠' };
  const RIBBON_LABEL = { hong: '홍단', cho: '초단', cheong: '청단' };

  function cardSvg(c) {
    let art = '';
    if (c.month === 8) {
      art = SPECIAL[8](c.kind) + PLANT[8]();
    } else {
      art = PLANT[c.month]();
      if (c.kind === 'tti') art += ribbon(RIBBON_TYPE[c.month]);
      else art += SPECIAL[c.month](c.kind);
    }
    if (c.kind === 'gwang') {
      art += `<circle cx="51" cy="9" r="7" fill="${W}" stroke="${R}" stroke-width="1.2"/><text x="51" y="12.2" font-size="9" fill="${R}" text-anchor="middle" font-family="serif" font-weight="900">光</text>`;
    }
    // 월 표시 (실제 화투엔 없지만 빠른 구분용)
    art += `<rect x="1.5" y="1.5" width="12" height="11" rx="2.5" fill="${K}" opacity=".82"/><text x="7.5" y="10" font-size="8.5" fill="${W}" text-anchor="middle" font-family="sans-serif" font-weight="700">${c.month}</text>`;
    return `<svg viewBox="0 0 60 96" preserveAspectRatio="none" aria-hidden="true"><rect width="60" height="96" fill="${W}"/>${art}</svg>`;
  }

  function describe(c) {
    const t = c.kind === 'tti' ? RIBBON_LABEL[RIBBON_TYPE[c.month]] : TYPE_LABEL[c.kind];
    return `${c.month}월 ${Core.MONTH_NAMES[c.month]} ${t}`;
  }

  function cardEl(c, opts = {}) {
    const d = document.createElement('div');
    if (!c || opts.back) {
      d.className = 'card back' + (opts.lg ? ' lg' : '') + (opts.anim ? ' deal-in' : '');
      return d;
    }
    d.className = `card face m${c.month} ${c.kind}` + (opts.lg ? ' lg' : '') + (opts.dim ? ' dim' : '') + (opts.anim ? ' deal-in' : '');
    d.title = describe(c);
    d.innerHTML = cardSvg(c);
    return d;
  }

  function miniCards(cards) {
    const w = document.createElement('div');
    w.className = 'mini';
    cards.forEach((c) => w.appendChild(cardEl(c)));
    return w;
  }

  /** 족보·규칙 표 + 섯다 패 20장 채우기 */
  function fillRules(rankSel, specialSel, deckSel) {
    const fill = (sel, rows) => {
      const t = document.querySelector(sel);
      if (!t || t.children.length) return;
      rows.forEach((r) => {
        const tr = document.createElement('tr');
        r.forEach((txt) => { const td = document.createElement('td'); td.textContent = txt; tr.appendChild(td); });
        t.appendChild(tr);
      });
    };
    fill(rankSel, Core.RANKING_TABLE);
    fill(specialSel, Core.SPECIAL_TABLE);
    const deck = document.querySelector(deckSel || '#deckView');
    if (deck && !deck.children.length) {
      const all = Core.makeDeck();
      for (let m = 1; m <= 10; m++) {
        const col = document.createElement('div');
        col.className = 'deck-month';
        const pair = document.createElement('div');
        pair.className = 'deck-pair';
        all.filter((c) => c.month === m).forEach((c) => {
          const fig = document.createElement('figure');
          fig.appendChild(cardEl(c));
          const cap = document.createElement('figcaption');
          cap.textContent = c.kind === 'tti' ? RIBBON_LABEL[RIBBON_TYPE[m]] : TYPE_LABEL[c.kind];
          fig.appendChild(cap);
          pair.appendChild(fig);
        });
        const title = document.createElement('div');
        title.className = 'deck-title';
        title.textContent = `${m}월 ${Core.MONTH_NAMES[m]}`;
        col.append(title, pair);
        deck.appendChild(col);
      }
    }
  }

  window.SeotdaCardsUI = { cardEl, miniCards, fillRules, describe };
})();
