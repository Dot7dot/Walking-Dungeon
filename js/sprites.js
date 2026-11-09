// 手繪 SVG 圖像：玩家、各屬性寶箱、鼴鼠洞、出口樓梯、鼴鼠、搖鈴、梯子

export function playerSVG(dir = 'down') {
  const ex = dir === 'left' ? -2.4 : dir === 'right' ? 2.4 : 0;
  const ey = dir === 'up' ? -2 : dir === 'down' ? 0.8 : 0;
  const back = dir === 'up';
  const packX = dir === 'left' ? 38 : 13;
  const face = back
    ? '<path d="M20 26 q12 9 24 0" stroke="#e7b98c" stroke-width="2" fill="none"/>'
    : `<circle cx="${27.5 + ex}" cy="${25.5 + ey}" r="2.1" fill="#2b1d12"/>
       <circle cx="${36.5 + ex}" cy="${25.5 + ey}" r="2.1" fill="#2b1d12"/>
       <circle cx="${28.2 + ex}" cy="${24.8 + ey}" r=".7" fill="#fff"/>
       <circle cx="${37.2 + ex}" cy="${24.8 + ey}" r=".7" fill="#fff"/>
       <circle cx="${23.4 + ex}" cy="${29.6 + ey}" r="2.3" fill="#ff8f8f" opacity=".5"/>
       <circle cx="${40.6 + ex}" cy="${29.6 + ey}" r="2.3" fill="#ff8f8f" opacity=".5"/>
       <path d="M${30 + ex} ${30.4 + ey} q2 2.2 4 0" stroke="#7a3b1f" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="58" rx="15" ry="3.6" fill="rgba(0,0,0,.3)"/>
    ${back ? '' : `<rect x="${packX}" y="31" width="13" height="18" rx="4.5" fill="#9a6232" stroke="#5e3a1a" stroke-width="1.5"/>`}
    <ellipse cx="26" cy="54.5" rx="5.5" ry="3.4" fill="#5b3a1e"/>
    <ellipse cx="38" cy="54.5" rx="5.5" ry="3.4" fill="#5b3a1e"/>
    <rect x="19" y="32" width="26" height="21" rx="10" fill="#3f7fd9" stroke="#24508f" stroke-width="1.5"/>
    ${back ? '<rect x="22" y="33" width="20" height="17" rx="5" fill="#9a6232" stroke="#5e3a1a" stroke-width="1.5"/>' : ''}
    <path d="M21 35 Q32 40.5 43 35 L43 39 Q32 44.5 21 39 Z" fill="#e8553f"/>
    <circle cx="32" cy="23" r="13.5" fill="#ffd8b0" stroke="#d9a77a" stroke-width="1.2"/>
    ${face}
    <path d="M17.5 21 a14.5 13 0 0 1 29 0 z" fill="#f2c14e" stroke="#b8862a" stroke-width="1.2"/>
    <rect x="14.5" y="19.3" width="35" height="4.2" rx="2.1" fill="#d9a531"/>
    <circle cx="32" cy="12.6" r="6" fill="#fff6c2" opacity=".35"/>
    <circle cx="32" cy="12.6" r="3.4" fill="#fff6c2" stroke="#b8862a" stroke-width="1.2"/>
  </svg>`;
}

const CHEST = {
  sand: { body: '#d39b4a', lid: '#e6b764', band: '#8c5a24', lock: '#ffd45c', dark: '#5a3713', trim: '#fbe3ad' },
  forest: { body: '#8d5b33', lid: '#a5703f', band: '#4f8a3c', lock: '#f2cc5b', dark: '#3b2414', trim: '#7fc36a' },
  swamp: { body: '#4e6e66', lid: '#62857c', band: '#2c4541', lock: '#c3b1ff', dark: '#1c2c29', trim: '#93cf97' },
};

function chestDeco(attr, c) {
  if (attr === 'sand') {
    return `<path d="M24 18 h16" stroke="${c.trim}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
      <circle cx="13" cy="34" r="1.6" fill="${c.trim}"/><circle cx="51" cy="34" r="1.6" fill="${c.trim}"/>
      <circle cx="13" cy="48" r="1.6" fill="${c.trim}"/><circle cx="51" cy="48" r="1.6" fill="${c.trim}"/>`;
  }
  if (attr === 'forest') {
    return `<path d="M45 15 q7 -7 12 1 q-7 5 -12 -1z" fill="${c.trim}" stroke="#2f5d25" stroke-width="1"/>
      <path d="M9 40 q5 -3 9 1 M46 46 q5 -3 9 1" stroke="${c.trim}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  return `<path d="M9 30 q3 7 6 0 q3 9 7 0 q3 6 6 0" fill="${c.trim}" opacity=".9"/>
    <path d="M38 30 q3 6 6 0 q3 8 6 0 q2 5 5 0" fill="${c.trim}" opacity=".9"/>
    <path d="M32 26.5 l3 3.5 -3 4 -3 -4z" fill="#fff" opacity=".55"/>`;
}

export function chestSVG(attr = 'sand', opened = false) {
  const c = CHEST[attr] || CHEST.sand;
  if (opened) {
    return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="55" rx="23" ry="4.5" fill="rgba(0,0,0,.28)"/>
      <path d="M11 30 L14 11 h36 l3 19 z" fill="${c.lid}" stroke="${c.dark}" stroke-width="2" stroke-linejoin="round"/>
      <rect x="9" y="27" width="46" height="7" rx="2" fill="#1c120a" stroke="${c.dark}" stroke-width="2"/>
      <rect x="9" y="32" width="46" height="21" rx="4" fill="${c.body}" stroke="${c.dark}" stroke-width="2"/>
      <rect x="17" y="32" width="5" height="21" fill="${c.band}"/>
      <rect x="42" y="32" width="5" height="21" fill="${c.band}"/>
      <circle cx="32" cy="22" r="2" fill="#fff" opacity=".5"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="55" rx="23" ry="4.5" fill="rgba(0,0,0,.3)"/>
    <rect x="9" y="29" width="46" height="24" rx="4" fill="${c.body}" stroke="${c.dark}" stroke-width="2"/>
    <path d="M9 31 V23 a11 11 0 0 1 11 -11 h24 a11 11 0 0 1 11 11 V31 z" fill="${c.lid}" stroke="${c.dark}" stroke-width="2"/>
    <rect x="17" y="13" width="5" height="39" fill="${c.band}"/>
    <rect x="42" y="13" width="5" height="39" fill="${c.band}"/>
    <rect x="10" y="29" width="44" height="3" fill="${c.dark}" opacity=".3"/>
    ${chestDeco(attr, c)}
    <rect x="26.5" y="24.5" width="11" height="12" rx="2.5" fill="${c.lock}" stroke="${c.dark}" stroke-width="1.5"/>
    <path d="M32 28.5 v4" stroke="${c.dark}" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

/** 鼴鼠洞：土堆中間有洞，一隻鼴鼠探出頭 */
export function holeSVG() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="42" rx="26" ry="14" fill="#7a5230"/>
    <ellipse cx="32" cy="40" rx="18" ry="9.5" fill="#2a1a0e"/>
    <ellipse cx="32" cy="38.5" rx="13" ry="6" fill="#120904"/>
    <g>
      <ellipse cx="32" cy="35" rx="9.5" ry="8" fill="#5f5068"/>
      <ellipse cx="32" cy="38.5" rx="3.4" ry="2.4" fill="#ff9fb2"/>
      <circle cx="28.4" cy="33" r="1.15" fill="#111"/>
      <circle cx="35.6" cy="33" r="1.15" fill="#111"/>
      <path d="M24 37 l-4 -1 M24 38.5 l-4 .6 M40 37 l4 -1 M40 38.5 l4 .6" stroke="#d7c6dd" stroke-width=".8"/>
    </g>
    <path d="M14 42 q18 10 36 0 q2 8 -18 10 q-20 -2 -18 -10z" fill="#8d6239"/>
    <ellipse cx="24.5" cy="43.5" rx="3.6" ry="2.2" fill="#ffc6cf"/>
    <ellipse cx="39.5" cy="43.5" rx="3.6" ry="2.2" fill="#ffc6cf"/>
    <circle cx="9" cy="47" r="2.6" fill="#8d6239"/><circle cx="56" cy="45" r="2.1" fill="#8d6239"/>
    <circle cx="13" cy="53" r="1.6" fill="#6b4626"/><circle cx="52" cy="52" r="1.8" fill="#6b4626"/>
  </svg>`;
}

/** 可收服的鼴鼠 */
export function moleSVG() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="57" rx="17" ry="3.5" fill="rgba(0,0,0,.25)"/>
    <ellipse cx="32" cy="38" rx="20" ry="17" fill="#5f5068"/>
    <ellipse cx="32" cy="44" rx="12" ry="9" fill="#7a6a84"/>
    <ellipse cx="32" cy="33" rx="5.5" ry="4" fill="#ff9fb2"/>
    <circle cx="25" cy="27" r="1.6" fill="#111"/>
    <circle cx="39" cy="27" r="1.6" fill="#111"/>
    <path d="M22 33 l-7 -2 M22 35 l-7 1 M42 33 l7 -2 M42 35 l7 1" stroke="#d7c6dd" stroke-width="1"/>
    <ellipse cx="17" cy="49" rx="7" ry="4.5" fill="#ffc6cf" transform="rotate(-25 17 49)"/>
    <ellipse cx="47" cy="49" rx="7" ry="4.5" fill="#ffc6cf" transform="rotate(25 47 49)"/>
  </svg>`;
}

const EXIT_GLOW = { sand: '#ffb347', forest: '#b6f07a', swamp: '#c3a6ff' };

/** 出口：往下的石階 */
export function exitSVG(attr = 'sand') {
  const g = EXIT_GLOW[attr] || '#ffd36b';
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M7 58 V27 a25 23 0 0 1 50 0 V58 z" fill="#3a2c22" stroke="#21170f" stroke-width="2"/>
    <path d="M12 58 V28 a20 19 0 0 1 40 0 V58 z" fill="#0d0805"/>
    <path d="M12 58 V28 a20 19 0 0 1 40 0 V58" fill="none" stroke="${g}" stroke-width="2" opacity=".85"/>
    <rect x="15" y="50" width="34" height="6" rx="1" fill="#6d5644"/>
    <rect x="18.5" y="43" width="27" height="5.5" rx="1" fill="#54412f"/>
    <rect x="22" y="36.5" width="20" height="5" rx="1" fill="#3e2f22"/>
    <rect x="25" y="30.5" width="14" height="4.5" rx="1" fill="#2c2118"/>
    <path d="M32 15 v7 m-3.5 -3.5 l3.5 3.5 3.5 -3.5" stroke="${g}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function bellSVG() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="12" y="8" width="40" height="5" rx="2.5" fill="#8a5a2b"/>
    <rect x="30.5" y="12" width="3" height="7" fill="#6b4422"/>
    <path d="M20 44 q0 -24 12 -24 q12 0 12 24 z" fill="#f4c542" stroke="#a87a12" stroke-width="2"/>
    <rect x="16" y="43" width="32" height="5" rx="2.5" fill="#e0ad27" stroke="#a87a12" stroke-width="1.5"/>
    <circle cx="32" cy="51.5" r="3.5" fill="#a87a12"/>
    <path d="M25 27 q2 -3 5 -3" stroke="#fff6c9" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M9 30 q-3 6 0 12 M55 30 q3 6 0 12" stroke="#ffe08a" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
  </svg>`;
}

export function ladderSVG() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="8" rx="20" ry="6" fill="#ffeaa3" opacity=".45"/>
    <rect x="17" y="4" width="5" height="56" rx="2" fill="#a0693a" stroke="#5e3a1a" stroke-width="1.2"/>
    <rect x="42" y="4" width="5" height="56" rx="2" fill="#a0693a" stroke="#5e3a1a" stroke-width="1.2"/>
    <rect x="20" y="14" width="24" height="4" rx="1.5" fill="#c08550"/>
    <rect x="20" y="27" width="24" height="4" rx="1.5" fill="#c08550"/>
    <rect x="20" y="40" width="24" height="4" rx="1.5" fill="#c08550"/>
    <rect x="20" y="53" width="24" height="4" rx="1.5" fill="#c08550"/>
  </svg>`;
}

/** 地塊上的小裝飾（依屬性與變化編號） */
export function decoSVG(attr, n) {
  if (!n) return '';
  const shapes = {
    sand: [
      '<path d="M10 40 q10 -6 20 0 t20 0" stroke="var(--deco)" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M18 50 q8 -5 16 0" stroke="var(--deco)" stroke-width="2" fill="none" stroke-linecap="round"/>',
      '<circle cx="18" cy="44" r="3.4" fill="var(--deco)"/><circle cx="25" cy="49" r="2.2" fill="var(--deco)"/><circle cx="46" cy="18" r="2.6" fill="var(--deco)"/>',
      '<path d="M40 40 l6 6 m-3 -6 l-2 9 m-4 -3 l8 -2" stroke="var(--deco)" stroke-width="2" stroke-linecap="round"/>',
    ],
    forest: [
      '<path d="M14 48 l3 -9 l3 9 M20 48 l4 -12 l3 12" stroke="var(--deco)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      '<circle cx="44" cy="18" r="3" fill="#ffe07a"/><circle cx="44" cy="18" r="1.3" fill="#e9874a"/><circle cx="16" cy="46" r="2.6" fill="#ff9ec1"/><circle cx="16" cy="46" r="1.1" fill="#fff3a8"/>',
      '<path d="M38 44 q8 -10 14 -2 q-7 6 -14 2z" fill="var(--deco)"/><path d="M12 20 q6 -8 11 -1 q-5 5 -11 1z" fill="var(--deco)"/>',
    ],
    swamp: [
      '<ellipse cx="22" cy="42" rx="12" ry="5" fill="var(--deco)"/><ellipse cx="22" cy="41" rx="7" ry="2.4" fill="rgba(255,255,255,.12)"/>',
      '<path d="M44 50 v-16 M48 50 v-12 M40 50 v-10" stroke="var(--deco)" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="44" cy="33" rx="1.8" ry="4" fill="#8a5a3c"/>',
      '<circle cx="18" cy="20" r="5" fill="var(--deco)"/><path d="M18 20 l5 -2" stroke="rgba(0,0,0,.25)" stroke-width="1.4"/><circle cx="44" cy="44" r="2" fill="rgba(255,255,255,.18)"/>',
    ],
  };
  const list = shapes[attr] || shapes.sand;
  return `<svg class="deco" viewBox="0 0 64 64" aria-hidden="true">${list[(n - 1) % list.length]}</svg>`;
}
