/* 화투 카드 그리기 (오프라인·온라인 공용) */
(function () {
  'use strict';
  const Core = window.SeotdaCore;
  const PLANT_EMOJI = { 1: '🌲', 2: '🌺', 3: '🌸', 4: '🌿', 5: '🪻', 6: '🌹', 7: '🍂', 8: '🌕', 9: '🌼', 10: '🍁' };
  const SPECIAL_EMOJI = { 1: '🦢', 2: '🐦', 3: '🏮', 4: '🐤', 5: '🌉', 6: '🦋', 7: '🐗', 8: '🌕', 9: '🍶', 10: '🦌' };
  const YEOL8 = '🦆';
  const RIBBON = { 1: ['red', '홍단'], 2: ['red', '홍단'], 3: ['red', '홍단'], 4: ['cho', '초단'], 5: ['cho', '초단'], 6: ['blue', '청단'], 7: ['cho', '초단'], 9: ['blue', '청단'], 10: ['blue', '청단'] };

  function cardEl(c, opts = {}) {
    if (!c || opts.back) {
      const b = document.createElement('div');
      b.className = 'card back' + (opts.lg ? ' lg' : '');
      return b;
    }
    const d = document.createElement('div');
    d.className = `card m${c.month} ${c.kind}` + (opts.lg ? ' lg' : '') + (opts.dim ? ' dim' : '');
    d.title = Core.cardLabel(c) + ' (' + Core.MONTH_NAMES[c.month] + ')';
    let inner = `<span class="mo">${c.month}</span>`;
    if (c.kind === 'gwang') {
      inner += `<span class="gw">光</span><span class="pic">${SPECIAL_EMOJI[c.month]}</span>`;
    } else if (c.kind === 'yeol') {
      inner += `<span class="yk">열</span><span class="pic">${c.month === 8 ? YEOL8 : SPECIAL_EMOJI[c.month]}</span>`;
    } else {
      const [cls, txt] = RIBBON[c.month] || ['red', ''];
      inner += `<span class="ribbon ${cls}">${txt}</span><span class="pic">${PLANT_EMOJI[c.month]}</span>`;
    }
    inner += `<span class="plant">${Core.MONTH_NAMES[c.month]}</span>`;
    d.innerHTML = inner;
    return d;
  }

  function miniCards(cards) {
    const w = document.createElement('div');
    w.className = 'mini';
    cards.forEach((c) => w.appendChild(cardEl(c)));
    return w;
  }

  /** 족보·규칙 표 채우기 */
  function fillRules(rankSel, specialSel) {
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
  }

  window.SeotdaCardsUI = { cardEl, miniCards, fillRules };
})();
