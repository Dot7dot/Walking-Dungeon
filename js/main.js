// 步行地牢：畫面、操作與各種面板
import {
  STEP_UNITS, PARTY_MAX, ATTRS, ATTR_IDS, FRUITS, ITEMS, FURNITURE, CREATURES, SKILLS, RARITY,
  NEST_W, NEST_H, NEST_FIXED, MERCHANT,
} from './data.js';
import * as G from './logic.js';
import { defaultState, load, save, clearSave, exportSave, importSave } from './store.js';
import { StepTracker, METHOD_LABEL, capabilities } from './tracker.js';
import { playerSVG, chestSVG, holeSVG, moleSVG, exitSVG, bellSVG, ladderSVG, decoSVG } from './sprites.js';
import { sfx, setSoundEnabled } from './audio.js';

const VERSION = '1.0.0';
const DEV = new URLSearchParams(location.search).has('dev');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const METHOD_ICON = { gps: '📡', motion: '📳', ble: '🔵', manual: '✍️' };

let state = load() || defaultState();
let tracker = null;
let metrics = null;
let sheet = null; // { name, data }
let wakeLock = null;
let nestTimer = null;
const nestPos = new Map();
let editMode = false;
let selectedFurniture = null;
let suppressClick = false;
let lastTrackerKey = '';

// ───────────────────────── 共用小工具 ─────────────────────────

let saveTimer = 0;
function persist(now = false) {
  clearTimeout(saveTimer);
  if (now) save(state);
  else saveTimer = setTimeout(() => save(state), 250);
}

function buzz(pattern) {
  if (!state.settings.vibrate || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

function creatureIcon(def) {
  return def.svg ? `<span class="svgicon">${moleSVG()}</span>` : `<span class="emo">${def.emoji}</span>`;
}

function itemIcon(id) {
  const d = G.defOf(id);
  return d ? `<span class="emo">${d.def.emoji}</span>` : '';
}

const itemName = (id) => (G.defOf(id) ? G.defOf(id).def.name : id);

function toast(html, cls = '', ms = 2600) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = html;
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  el.addEventListener('click', () => el.remove());
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

function log(html) {
  const el = $('#log');
  if (!el) return;
  el.innerHTML = `<div>${html}</div>`;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function km(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} 公里` : `${Math.round(meters)} 公尺`;
}

function unitIsShake() {
  return tracker && tracker.state.method === 'motion';
}

// ───────────────────────── HUD 與計步 ─────────────────────────

function renderHud() {
  $('#steps').textContent = state.steps;
  $('#coins').textContent = state.coins;
  const p = Math.max(0, Math.min(STEP_UNITS, state.progress));
  $('#progress-fill').style.width = `${(p / STEP_UNITS) * 100}%`;
  $('#progress-text').textContent = unitIsShake()
    ? `已搖 ${Math.floor(p)} / ${STEP_UNITS} 次`
    : `${Math.floor(p)} / ${STEP_UNITS} 公尺`;
}

function trackerPillText(s) {
  switch (s.phase) {
    case 'idle':
      return { text: state.started ? '計步已暫停，現在走路不會累積步數' : '計步尚未啟動', go: '開始 ›' };
    case 'starting':
      return { text: `${METHOD_ICON[s.method] || ''} ${s.detail}`, go: '' };
    case 'active':
      if (s.method === 'manual') return { text: '✍️ 手動同步模式：輸入健康 App 的距離', go: '同步 ›' };
      if (s.method === 'motion') return { text: `📳 搖晃計步中・本次已搖 ${s.shakes} 次`, go: '' };
      return { text: `${METHOD_ICON[s.method]} ${METHOD_LABEL[s.method]}・${s.detail}`, go: '' };
    case 'need-gesture':
      return { text: '📳 GPS 無法使用，改用搖晃計步', go: '點此啟用 ›' };
    case 'choose':
      return { text: `⚠️ 自動計步失敗（${s.detail}）`, go: '選擇方式 ›' };
    case 'error':
      return { text: `⚠️ ${METHOD_LABEL[s.method] || '計步'}：${s.detail}`, go: '設定 ›' };
    default:
      return { text: s.detail || '', go: '' };
  }
}

function renderTrackerPill() {
  const s = tracker.state;
  const pill = $('#tracker-pill');
  pill.dataset.phase = s.phase;
  pill.dataset.signal = s.signal || '';
  const { text, go } = trackerPillText(s);
  $('#tracker-text').textContent = text;
  $('#tracker-go').textContent = go;
}

function onTrackerChange() {
  renderTrackerPill();
  renderHud();
  if (sheet && sheet.name === 'tracker') {
    const s = tracker.state;
    const key = `${s.phase}|${s.method}|${s.pref}|${s.log.length}`;
    if (key !== lastTrackerKey) refreshSheet();
    else {
      const live = $('#trk-live');
      if (live) live.innerHTML = trackerLiveHTML();
    }
  }
  if (tracker.state.phase === 'active') requestWake();
}

function onUnits(units) {
  const gained = G.addUnits(state, units);
  if (gained > 0) {
    sfx('gain');
    buzz(30);
    toast(`<span class="emo">👣</span> 走路累積了 <b>${gained}</b> 步！`, 'good', 1800);
    const hs = $('#hud-steps');
    hs.classList.remove('pulse');
    void hs.offsetWidth;
    hs.classList.add('pulse');
  }
  renderHud();
  persist();
}

function startTracking(pref = state.tracker.pref, { gesture = true } = {}) {
  state.tracker.pref = pref;
  state.tracker.running = true;
  persist();
  tracker.setSensitivity(state.tracker.sensitivity);
  tracker.start(pref, { gesture });
}

function stopTracking() {
  state.tracker.running = false;
  persist();
  tracker.stop();
  releaseWake();
}

let wakePending = false;
async function requestWake() {
  if (wakeLock || wakePending || !state.tracker.wake || !('wakeLock' in navigator)) return;
  if (document.visibilityState !== 'visible' || !tracker || tracker.state.phase !== 'active') return;
  if (tracker.state.method === 'manual') return;
  wakePending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
    wakeLock = lock;
  } catch {
    wakeLock = null;
  } finally {
    wakePending = false;
  }
}

function releaseWake() {
  try {
    if (wakeLock) wakeLock.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

// ───────────────────────── 場景 ─────────────────────────

function render() {
  const inDungeon = state.scene === 'dungeon' && !!state.dungeon;
  document.body.dataset.attr = inDungeon ? state.dungeon.attr : 'nest';
  $('#dungeon-view').hidden = !inDungeon;
  $('#nest-view').hidden = inDungeon;
  renderHud();
  if (inDungeon) {
    stopNestLife();
    renderDungeon();
  } else {
    renderNest();
    startNestLife();
  }
}

function fadeSwap(fn) {
  const app = $('#app');
  app.style.transition = 'opacity .22s';
  app.style.opacity = '0';
  setTimeout(() => {
    fn();
    app.style.opacity = '1';
  }, 230);
}

// ───────────────────────── 地牢畫面 ─────────────────────────

function computeMetrics() {
  const n = state.dungeon.size;
  const view = $('#dungeon-view');
  const appW = Math.min(document.documentElement.clientWidth, 520);
  const availW = appW - 24 - 26;
  const cs = getComputedStyle($('#app'));
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const others = $('.hud').offsetHeight + $('#floor-bar').offsetHeight + $('#log').offsetHeight + $('.controls', view).offsetHeight;
  const availH = window.innerHeight - others - padY - 8 * 4 - 20 - 22;
  const box = Math.max(170, Math.min(availW, availH, 470));
  const gap = n >= 5 ? 4 : n === 4 ? 5 : 6;
  const pad = n >= 4 ? 7 : 9;
  const maxTile = n <= 2 ? 116 : n === 3 ? 110 : 104;
  const tile = Math.max(34, Math.min(Math.floor((box - pad * 2 - gap * (n - 1)) / n), maxTile));
  return { n, tile, gap, pad };
}

function tilePos(x, y) {
  return [metrics.pad + x * (metrics.tile + metrics.gap), metrics.pad + y * (metrics.tile + metrics.gap)];
}

function renderDungeon() {
  const d = state.dungeon;
  const A = ATTRS[d.attr];
  $('#floor-bar').innerHTML = `<span class="attr-chip ${d.attr}">${A.dungeon}</span><span>第 <b>${d.floor}</b> 層</span><span>${d.size} × ${d.size}</span>`;
  metrics = computeMetrics();
  const board = $('#board');
  const key = String(d.floor);
  if (board.dataset.floor !== key) {
    board.dataset.floor = key;
    $('#actors').innerHTML = '';
    $('#fx').innerHTML = '';
    board.style.animation = 'none';
    void board.offsetWidth;
    board.style.animation = '';
  }
  board.dataset.attr = d.attr;
  board.style.setProperty('--n', d.size);
  board.style.setProperty('--tile', `${metrics.tile}px`);
  board.style.setProperty('--gap', `${metrics.gap}px`);
  board.style.setProperty('--pad', `${metrics.pad}px`);
  renderTiles();
  renderActors({ instant: true });
  updateCtx();
}

function entHTML(t, d) {
  const e = t.ent;
  if (!e) return '';
  switch (e.type) {
    case 'exit':
      return `<div class="ent ent-exit">${exitSVG(d.attr)}</div>`;
    case 'coin':
      return '<div class="ent ent-coin"><i class="coin"></i></div>';
    case 'fruit':
      return `<div class="ent ent-fruit"><span class="bush"></span><span class="emo">${FRUITS[e.fid].emoji}</span></div>`;
    case 'chest':
      return `<div class="ent ent-chest${e.opened ? ' opened' : ''}">${chestSVG(d.attr, e.opened)}</div>`;
    case 'hole':
      return `<div class="ent ent-hole">${holeSVG()}</div>`;
    case 'merchant':
      return `<div class="ent ent-merchant"><span class="emo">${MERCHANT.emoji}</span><span class="sign">商人</span></div>`;
    case 'creature': {
      const def = CREATURES[e.sid];
      const badge = e.aff > 0 ? `<span class="aff-badge">♥ ${e.aff}/${def.need}</span>` : '';
      return `<div class="ent ent-creature r${def.rarity}">${creatureIcon(def)}${badge}</div>`;
    }
    default:
      return '';
  }
}

function tileInfo(t, d) {
  if (!t.seen) return '還沒探索過的地方';
  const e = t.ent;
  if (!e) return '空地';
  switch (e.type) {
    case 'exit':
      return '往下一層的樓梯';
    case 'coin':
      return '地上的錢幣，走過去就能撿起來';
    case 'fruit':
      return `${FRUITS[e.fid].emoji} ${FRUITS[e.fid].name}的果樹，走過去採收`;
    case 'chest':
      return e.opened ? '已經打開的寶箱' : `${ATTRS[d.attr].chest}，走過去打開`;
    case 'hole':
      return '鼴鼠洞，踩上去可以回到地底小窩';
    case 'merchant':
      return '浣熊商人，走到旁邊再往他的方向走就能買東西';
    case 'creature': {
      const def = CREATURES[e.sid];
      return `${def.name}（${RARITY[def.rarity].name}），走到旁邊再往牠的方向走就能餵食`;
    }
    default:
      return '';
  }
}

function renderTiles(fresh = []) {
  const d = state.dungeon;
  const p = d.player;
  const front = G.frontTile(d);
  $('#tiles').innerHTML = d.tiles
    .map((t) => {
      const near = Math.abs(t.x - p.x) + Math.abs(t.y - p.y) === 1;
      const cls = ['tile', (t.x + t.y) % 2 ? 'v1' : 'v0'];
      if (!t.seen) cls.push('fog');
      if (near) cls.push('near');
      if (front === t) cls.push('front');
      if (fresh.includes(t)) cls.push('fresh');
      const inner = t.seen ? decoSVG(d.attr, t.deco) + entHTML(t, d) : '<span class="fog-mark">?</span>';
      return `<button class="${cls.join(' ')}" data-x="${t.x}" data-y="${t.y}" tabindex="-1" aria-label="${esc(tileInfo(t, d))}">${inner}</button>`;
    })
    .join('');
}

function setPos(el, x, y, instant, delay = 0) {
  el.style.transitionDuration = instant ? '0s' : '';
  el.style.transitionDelay = instant ? '0s' : `${delay}ms`;
  el.style.transform = `translate(${x}px, ${y}px)`;
  if (instant) {
    void el.offsetWidth;
    el.style.transitionDuration = '';
  }
}

function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function renderActors({ instant = false, hop = false } = {}) {
  const d = state.dungeon;
  const box = $('#actors');
  let pl = $('#actor-player');
  if (!pl) {
    pl = document.createElement('div');
    pl.id = 'actor-player';
    pl.className = 'actor player';
    pl.innerHTML = '<div class="body"></div>';
    box.append(pl);
    instant = true;
  }
  pl.querySelector('.body').innerHTML = playerSVG(d.player.dir);
  setPos(pl, ...tilePos(d.player.x, d.player.y), instant);
  if (hop) replay(pl, 'hop');

  const keep = new Set(state.party);
  for (const el of $$('.actor.follower', box)) if (!keep.has(el.dataset.uid)) el.remove();
  const stack = [[-0.3, 0.1], [0.3, 0.1], [0, 0.24]];
  state.party.forEach((uid, i) => {
    const c = G.findCreature(state, uid);
    if (!c) return;
    let el = box.querySelector(`.actor.follower[data-uid="${uid}"]`);
    let isNew = false;
    if (!el) {
      el = document.createElement('div');
      el.className = 'actor follower';
      el.dataset.uid = uid;
      el.innerHTML = `<div class="body">${creatureIcon(CREATURES[c.sid])}</div>`;
      box.append(el);
      isNew = true;
    }
    const pos = d.trail[i] || d.trail[d.trail.length - 1] || d.player;
    let [x, y] = tilePos(pos.x, pos.y);
    if (pos.x === d.player.x && pos.y === d.player.y) {
      x += stack[i][0] * metrics.tile;
      y += stack[i][1] * metrics.tile;
    } else {
      x += (i - 1) * 0.07 * metrics.tile;
    }
    setPos(el, x, y, instant || isNew, 50 + i * 60);
    if (hop && !instant) setTimeout(() => replay(el, 'hop'), 50 + i * 60);
  });
}

function floatAt(x, y, html, cls = '') {
  if (!metrics) return;
  const [px, py] = tilePos(x, y);
  const el = document.createElement('div');
  el.className = `floater ${cls}`;
  el.innerHTML = html;
  el.style.left = `${px + metrics.tile / 2}px`;
  el.style.top = `${py + metrics.tile * 0.35}px`;
  $('#fx').append(el);
  setTimeout(() => el.remove(), 1200);
}

function updateCtx() {
  const btn = $('#ctx-btn');
  const d = state.dungeon;
  const t = d && G.tileAt(d, d.player.x, d.player.y);
  const type = t && t.ent ? t.ent.type : null;
  btn.classList.toggle('ready', type === 'exit' || type === 'hole');
  if (type === 'exit') {
    btn.textContent = '下一層';
    btn.dataset.ctx = 'exit';
  } else if (type === 'hole') {
    btn.textContent = '進洞';
    btn.dataset.ctx = 'hole';
  } else {
    btn.textContent = '背包';
    btn.dataset.ctx = 'bag';
  }
}

function ctxAction() {
  const c = $('#ctx-btn').dataset.ctx;
  if (c === 'exit') confirmExit();
  else if (c === 'hole') confirmHole();
  else openSheet('bag');
}

function remainingText() {
  const remain = Math.max(1, Math.ceil(STEP_UNITS - state.progress));
  return unitIsShake() ? `再搖 ${remain} 次` : `再走 ${remain} 公尺`;
}

function idleSummary() {
  const d = state.dungeon;
  const dark = d.tiles.filter((t) => !t.seen).length;
  const steps = state.steps > 0 ? `還有 <b>${state.steps}</b> 步` : `步數用完了，${remainingText()}就有下一步`;
  return dark ? `${steps}・這層還有 ${dark} 格沒探索` : `${steps}・這層已經全部看過了`;
}

function doMove(dir) {
  if (state.scene !== 'dungeon' || !state.dungeon || sheet) return;
  const d = state.dungeon;
  const seenBefore = new Set(d.tiles.filter((t) => t.seen));
  const res = G.tryMove(state, dir);
  const fresh = d.tiles.filter((t) => t.seen && !seenBefore.has(t));
  if (res.moved) {
    sfx('step');
    buzz(8);
  }
  renderTiles(fresh);
  renderActors({ hop: res.moved });
  renderHud();
  updateCtx();
  const logged = handleEvents(res.events);
  if (res.moved && !logged) log(idleSummary());
  persist();
}

function bumpPlayer() {
  const pl = $('#actor-player');
  if (pl) replay(pl, 'bump');
}

/** 處理移動或道具產生的事件，回傳是否已經寫了訊息 */
function handleEvents(events) {
  let logged = false;
  for (const e of events) {
    switch (e.type) {
      case 'move':
        if (e.saved) floatAt(e.x, e.y, '👟 省步！', 'good');
        break;
      case 'wall':
        bumpPlayer();
        break;
      case 'no-steps':
        bumpPlayer();
        sfx('error');
        buzz([20, 30, 20]);
        toast(
          tracker.state.phase === 'idle'
            ? '👣 步數用完了！點上方的「開始」啟動計步，出門走走吧'
            : `👣 步數用完了！${remainingText()}就有下一步`,
          'bad',
        );
        log(idleSummary());
        logged = true;
        break;
      case 'coin':
        sfx('coin');
        floatAt(e.x, e.y, `+${e.n} <i class="coin-ic"></i>`, 'gold');
        log(`撿到 <b>${e.n}</b> 枚錢幣${e.n > 1 ? '（招財發動！）' : ''}${e.magnet ? '・磁力吸過來的' : ''}`);
        logged = true;
        break;
      case 'fruit':
        sfx('fruit');
        floatAt(e.x, e.y, `+${e.n} ${FRUITS[e.id].emoji}`);
        log(`採到 ${FRUITS[e.id].emoji} <b>${FRUITS[e.id].name}</b> ×${e.n}${e.n > 1 ? '（採集發動！）' : ''}`);
        logged = true;
        break;
      case 'chest': {
        sfx('chest');
        buzz([20, 40, 20]);
        const A = ATTRS[state.dungeon.attr];
        const items = e.loot.map((l) => `<span>${itemIcon(l.id)} ${itemName(l.id)} ×${l.n}</span>`).join('');
        toast(`打開了${A.chest}！${e.bonus ? '（尋寶發動！）' : ''}<div class="loot">${items}</div>`, 'good', 3400);
        log(`打開 <b>${A.chest}</b>：${e.loot.map((l) => `${itemIcon(l.id)}×${l.n}`).join(' ')}`);
        logged = true;
        break;
      }
      case 'level': {
        const c = G.findCreature(state, e.uid);
        const def = CREATURES[c.sid];
        sfx('level');
        const learned = e.skills.map((s) => `${SKILLS[s.type].icon}${SKILLS[s.type].name}`).join('、');
        toast(`${creatureIcon(def)} ${def.name} 升到 <b>Lv${e.lv}</b>！${learned ? `<br>能力提升：${learned}` : ''}`, 'good', 3400);
        break;
      }
      case 'creature':
        openSheet('creature', { x: e.x, y: e.y });
        break;
      case 'merchant':
        openSheet('shop', { x: e.x, y: e.y });
        break;
      case 'hole':
        log('踩到了 <b>鼴鼠洞</b>！');
        logged = true;
        setTimeout(confirmHole, 260);
        break;
      case 'exit':
        log('找到 <b>出口</b> 了！');
        logged = true;
        setTimeout(confirmExit, 260);
        break;
      case 'hole-dug':
        sfx('warp');
        floatAt(e.x, e.y, '挖挖挖！');
        log('鼴鼠在你面前挖出了一個 <b>鼴鼠洞</b>！');
        logged = true;
        break;
      case 'creature-arrive': {
        const def = CREATURES[e.sid];
        sfx('feed');
        floatAt(e.x, e.y, '❗');
        log(`${creatureIcon(def)} <b>${def.name}</b> 被香味吸引過來了！`);
        logged = true;
        break;
      }
      case 'coins-appear':
        sfx('coin');
        for (const t of e.tiles) floatAt(t.x, t.y, '✨');
        log(`地上冒出了 <b>${e.tiles.length}</b> 枚錢幣！`);
        logged = true;
        break;
      case 'reveal-exit':
        sfx('fruit');
        floatAt(e.x, e.y, '🧭');
        log('指南針指出了 <b>出口</b> 的位置！');
        logged = true;
        break;
      case 'reveal-all':
        sfx('chest');
        log('提燈照亮了整層地牢！');
        logged = true;
        break;
      case 'merchant-arrive':
        sfx('buy');
        floatAt(e.x, e.y, '📯');
        log('浣熊商人聽到號角，趕過來擺攤了！');
        logged = true;
        break;
      default:
        break;
    }
  }
  return logged;
}

function floorIntro() {
  const d = state.dungeon;
  const A = ATTRS[d.attr];
  const seen = d.tiles.filter((t) => t.seen && t.ent);
  const cre = seen.find((t) => t.ent.type === 'creature');
  const mer = seen.find((t) => t.ent.type === 'merchant');
  let extra = '四處看看吧！';
  if (mer) extra = '浣熊商人在這層擺攤！';
  else if (cre) extra = `附近有 ${creatureIcon(CREATURES[cre.ent.sid])}，往牠的方向走就能餵牠水果。`;
  log(`來到第 <b>${d.floor}</b> 層・${A.dungeon}（${d.size}×${d.size}）。${extra}`);
}

function goNextFloor() {
  sfx('warp');
  fadeSwap(() => {
    G.enterNewFloor(state);
    render();
    floorIntro();
    persist(true);
  });
}

function goNest() {
  sfx('warp');
  const pl = $('#actor-player');
  if (pl) replay(pl, 'warp');
  setTimeout(() => {
    fadeSwap(() => {
      G.enterNest(state);
      editMode = false;
      selectedFurniture = null;
      render();
      persist(true);
    });
  }, 260);
}

function confirmExit() {
  if (state.scene !== 'dungeon') return;
  openSheet('dialog', {
    art: exitSVG(state.dungeon.attr),
    title: '找到出口了！',
    text: '要前往下一層嗎？離開之後，這層地牢就會消失。',
    yes: '前往下一層',
    no: '再看看',
    onYes: goNextFloor,
  });
}

function confirmHole() {
  if (state.scene !== 'dungeon') return;
  openSheet('dialog', {
    art: holeSVG(),
    title: '鼴鼠洞',
    text: '要跳進鼴鼠洞，回到地底小窩嗎？離開之後，這層地牢就會消失。',
    yes: '跳進去',
    no: '先不要',
    onYes: goNest,
  });
}

// ───────────────────────── 地底小窩 ─────────────────────────

function computeNestCell() {
  const view = $('#nest-view');
  const appW = Math.min(document.documentElement.clientWidth, 520);
  const byW = Math.floor((appW - 24 - 26 - 20 - 4 * (NEST_W - 1)) / NEST_W);
  const cs = getComputedStyle($('#app'));
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const others = $('.hud').offsetHeight + $('.nest-head', view).offsetHeight + $('#nest-party').offsetHeight
    + $('.nest-actions', view).offsetHeight + $('.menu', view).offsetHeight
    + (editMode ? $('#tray').offsetHeight + $('#edit-hint').offsetHeight + 16 : 0);
  const availH = window.innerHeight - others - padY - 8 * 6 - 34;
  const byH = Math.floor((availH - 4 * (NEST_H - 1)) / (NEST_H + 0.6));
  return Math.max(36, Math.min(byW, byH, 66));
}

function renderNest() {
  const room = $('#nest-room');
  room.classList.toggle('editing', editMode);
  $('#decorate-btn').classList.toggle('on', editMode);
  $('#decorate-btn').innerHTML = editMode ? '<span class="emo">✅</span>完成佈置' : '<span class="emo">🛠️</span>佈置小窩';
  $('#nest-sub').textContent = `收服的夥伴 ${state.creatures.length} 隻・隊伍 ${state.party.length}/${PARTY_MAX}`;
  const slots = [];
  for (let i = 0; i < PARTY_MAX; i++) {
    const c = G.findCreature(state, state.party[i]);
    slots.push(c ? `<span class="party-slot filled" title="${esc(CREATURES[c.sid].name)}">${creatureIcon(CREATURES[c.sid])}</span>` : '<span class="party-slot"></span>');
  }
  $('#nest-party').innerHTML = `<span>目前隊伍</span>${slots.join('')}`;
  renderTray();
  const cell = computeNestCell();
  room.style.setProperty('--cols', NEST_W);
  room.style.setProperty('--cell', `${cell}px`);
  const cells = [];
  for (let y = 0; y < NEST_H; y++) {
    for (let x = 0; x < NEST_W; x++) {
      const fixed = G.nestFixedAt(x, y);
      const item = G.nestItemAt(state, x, y);
      const alt = (x + y) % 2 ? ' alt' : '';
      if (fixed === 'bell') {
        cells.push(`<button class="nest-cell fixed" data-x="${x}" data-y="${y}" aria-label="搖鈴區">${bellSVG()}<span class="cell-label">搖鈴區</span></button>`);
      } else if (fixed === 'ladder') {
        cells.push(`<button class="nest-cell fixed" data-x="${x}" data-y="${y}" aria-label="出發探險">${ladderSVG()}<span class="cell-label">出發</span></button>`);
      } else if (item) {
        cells.push(`<button class="nest-cell has-item${alt}" data-x="${x}" data-y="${y}" aria-label="${esc(FURNITURE[item.id].name)}"><span class="emo">${FURNITURE[item.id].emoji}</span></button>`);
      } else {
        cells.push(`<button class="nest-cell${alt}" data-x="${x}" data-y="${y}" aria-label="空地"></button>`);
      }
    }
  }
  $('#nest-grid').innerHTML = cells.join('');
  renderNestCreatures(true);
}

function renderTray() {
  const tray = $('#tray');
  const hint = $('#edit-hint');
  tray.hidden = !editMode;
  hint.hidden = !editMode;
  if (!editMode) return;
  const owned = Object.keys(FURNITURE).filter((id) => G.invCount(state, id) > 0);
  if (selectedFurniture && !owned.includes(selectedFurniture)) selectedFurniture = null;
  tray.innerHTML = owned.length
    ? owned
        .map((id) => `<button class="tray-item${selectedFurniture === id ? ' sel' : ''}" data-furn="${id}"><span class="emo">${FURNITURE[id].emoji}</span>${esc(FURNITURE[id].name)}<small>×${G.invCount(state, id)}</small></button>`)
        .join('')
    : '<div class="tray-empty">還沒有家具。地牢裡的浣熊商人有在賣喔！</div>';
  hint.textContent = selectedFurniture
    ? `點空地擺放「${FURNITURE[selectedFurniture].name}」，點已擺好的家具可以收回`
    : '先選一件家具，再點小窩的空地擺放；點已擺好的家具可以收回';
}

function nestFreeCells() {
  const out = [];
  for (let y = 0; y < NEST_H; y++) {
    for (let x = 0; x < NEST_W; x++) {
      if (!G.nestFixedAt(x, y) && !G.nestItemAt(state, x, y)) out.push({ x, y });
    }
  }
  return out;
}

function nestResidents() {
  return state.creatures.filter((c) => !state.party.includes(c.uid)).slice(-12);
}

function nestCellXY(x, y) {
  const cell = parseFloat(getComputedStyle($('#nest-room')).getPropertyValue('--cell')) || 48;
  return [x * (cell + 4), y * (cell + 4)];
}

function renderNestCreatures(reset = false) {
  const box = $('#nest-creatures');
  const residents = nestResidents();
  const ids = new Set(residents.map((c) => c.uid));
  for (const el of $$('.nest-creature', box)) if (!ids.has(el.dataset.uid)) el.remove();
  const free = nestFreeCells();
  const taken = new Set();
  for (const c of residents) {
    let p = nestPos.get(c.uid);
    const ok = p && free.some((f) => f.x === p.x && f.y === p.y) && !taken.has(`${p.x},${p.y}`);
    if (!ok) {
      const options = free.filter((f) => !taken.has(`${f.x},${f.y}`));
      p = options.length ? options[Math.floor(Math.random() * options.length)] : free[0] || { x: 1, y: 1 };
      nestPos.set(c.uid, p);
    }
    taken.add(`${p.x},${p.y}`);
    let el = box.querySelector(`.nest-creature[data-uid="${c.uid}"]`);
    const isNew = !el;
    if (!el) {
      el = document.createElement('div');
      el.className = 'nest-creature';
      el.dataset.uid = c.uid;
      el.innerHTML = `${creatureIcon(CREATURES[c.sid])}${Math.random() < 0.3 ? '<span class="zz">z</span>' : ''}`;
      box.append(el);
    }
    const [x, y] = nestCellXY(p.x, p.y);
    setPos(el, x, y, reset || isNew);
  }
  const room = $('#nest-room');
  const pad = getComputedStyle(room);
  box.style.left = pad.paddingLeft;
  box.style.top = pad.paddingTop;
}

function wander() {
  if (state.scene !== 'nest' || document.hidden) return;
  const free = nestFreeCells();
  const occupied = new Set([...nestPos.values()].map((p) => `${p.x},${p.y}`));
  for (const c of nestResidents()) {
    if (Math.random() < 0.55) continue;
    const p = nestPos.get(c.uid);
    if (!p) continue;
    const dirs = Object.values(G.DIRS).sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (free.some((f) => f.x === n.x && f.y === n.y) && !occupied.has(`${n.x},${n.y}`)) {
        occupied.delete(`${p.x},${p.y}`);
        occupied.add(`${n.x},${n.y}`);
        nestPos.set(c.uid, n);
        break;
      }
    }
  }
  renderNestCreatures(false);
}

function startNestLife() {
  stopNestLife();
  nestTimer = setInterval(wander, 2000);
}

function stopNestLife() {
  if (nestTimer) clearInterval(nestTimer);
  nestTimer = null;
}

function onNestCell(x, y) {
  const fixed = G.nestFixedAt(x, y);
  if (fixed === 'bell') {
    sfx('bell');
    openSheet('bell');
    return;
  }
  if (fixed === 'ladder') {
    confirmLeaveNest();
    return;
  }
  const item = G.nestItemAt(state, x, y);
  if (!editMode) {
    if (item) toast(`${FURNITURE[item.id].emoji} ${FURNITURE[item.id].name}`, '', 1200);
    return;
  }
  if (item) {
    const r = G.pickupFurniture(state, x, y);
    if (r.ok) {
      sfx('buy');
      selectedFurniture = r.id;
    }
  } else if (selectedFurniture) {
    const r = G.placeFurniture(state, selectedFurniture, x, y);
    if (!r.ok) toast(r.msg, 'bad');
    else sfx('fruit');
  } else {
    toast('先從下方選一件家具', '', 1500);
    return;
  }
  persist();
  renderNest();
}

function confirmLeaveNest() {
  openSheet('dialog', {
    art: ladderSVG(),
    title: '出發探險',
    text: `爬上梯子，前往新的地牢（第 ${state.floor + 1} 層）。${state.party.length ? '' : '目前沒有夥伴跟著你，可以先到搖鈴區呼喚牠們。'}`,
    yes: '出發！',
    no: '再待一下',
    onYes: () => {
      editMode = false;
      fadeSwap(() => {
        G.enterNewFloor(state);
        render();
        floorIntro();
        persist(true);
      });
    },
  });
}

// ───────────────────────── 面板（sheet） ─────────────────────────

function openSheet(name, data = {}) {
  sheet = { name, data };
  $('#sheet-root').hidden = false;
  refreshSheet(true);
}

function refreshSheet(first = false) {
  if (!sheet) return;
  const out = SHEETS[sheet.name](sheet.data);
  if (!out) {
    closeSheet();
    return;
  }
  const root = $('#sheet-root');
  root.classList.toggle('center', !!out.center);
  $('.sheet', root).classList.toggle('center', !!out.center);
  $('#sheet-title').innerHTML = out.title;
  const body = $('#sheet-body');
  const top = body.scrollTop;
  body.innerHTML = out.html;
  body.scrollTop = first ? 0 : top;
  if (sheet.name === 'tracker') {
    const s = tracker.state;
    lastTrackerKey = `${s.phase}|${s.method}|${s.pref}|${s.log.length}`;
  }
}

function closeSheet() {
  if (!sheet) return;
  const s = sheet;
  sheet = null;
  $('#sheet-root').hidden = true;
  if (s.data && s.data.after) s.data.after();
}

const SHEETS = {
  dialog: renderDialog,
  bag: renderBag,
  party: renderParty,
  dex: renderDex,
  species: renderSpecies,
  creature: renderCreatureSheet,
  shop: renderShop,
  bell: renderBell,
  tracker: renderTrackerSheet,
  settings: renderSettings,
};

function renderDialog(d) {
  return {
    center: true,
    title: esc(d.title),
    html: `<div class="dialog-hero"><div class="art">${d.art || ''}</div><p>${esc(d.text)}</p></div>
      <div class="dialog-actions"><button class="btn" data-act="no">${esc(d.no || '取消')}</button><button class="btn primary" data-act="yes">${esc(d.yes || '好')}</button></div>`,
  };
}

function kindTag(id) {
  const d = G.defOf(id);
  if (!d) return '';
  if (d.kind === 'fruit') return `<span class="tag attr-${d.def.attr}">${ATTRS[d.def.attr].name}</span>${d.def.rare ? ' <span class="tag r3">稀有</span>' : ''}`;
  if (d.kind === 'item') return `<span class="tag">${d.def.kind === 'snack' ? '零食' : '道具'}</span>`;
  return `<span class="tag">家具</span>${d.def.attr ? ` <span class="tag attr-${d.def.attr}">${ATTRS[d.def.attr].name}風</span>` : ''}`;
}

function renderBag(data) {
  const tab = data.tab || 'fruit';
  const kinds = { fruit: '水果', item: '零食・道具', furniture: '家具' };
  const ids = (k) => Object.keys(state.inv).filter((id) => G.defOf(id) && G.defOf(id).kind === k);
  const order = (k) => Object.keys(k === 'fruit' ? FRUITS : k === 'item' ? ITEMS : FURNITURE);
  const list = order(tab).filter((id) => ids(tab).includes(id));
  const tabs = Object.entries(kinds)
    .map(([k, name]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${name}（${ids(k).reduce((s, id) => s + state.inv[id], 0)}）</button>`)
    .join('');
  let rows = list
    .map((id) => {
      const { kind, def } = G.defOf(id);
      let action = '';
      if (kind === 'item') {
        action = state.scene === 'dungeon'
          ? `<button class="btn small primary" data-act="use" data-id="${id}">使用</button>`
          : '<span class="fine">地牢中使用</span>';
      } else if (kind === 'furniture') {
        action = state.scene === 'nest'
          ? `<button class="btn small" data-act="place" data-id="${id}">擺放</button>`
          : '<span class="fine">回小窩擺放</span>';
      }
      return `<div class="item-row"><div class="item-icon"><span class="emo">${def.emoji}</span></div>
        <div class="item-main"><div class="item-name">${esc(def.name)} <small>×${state.inv[id]}</small> ${kindTag(id)}</div>
        <div class="item-desc">${esc(def.desc || (kind === 'furniture' ? '可以擺在地底小窩的家具。' : ''))}</div></div>${action}</div>`;
    })
    .join('');
  if (!rows) {
    rows = `<p class="empty">${tab === 'fruit' ? '沒有水果。地牢裡的果樹、寶箱和商人都能取得水果。' : tab === 'item' ? '沒有零食或道具。打開寶箱或向商人購買吧！' : '沒有家具。浣熊商人有在賣家具喔！'}</p>`;
  }
  const tip = tab === 'fruit' ? '<p class="fine">在地牢裡往生物的方向走，就可以餵牠水果、增加好感度。</p>' : '';
  return { title: '🎒 背包', html: `<div class="tabs">${tabs}</div>${tip}${rows}` };
}

function hearts(aff, need, pop = -1) {
  let h = '';
  for (let i = 0; i < need; i++) h += `<span class="h${i < aff ? ' on' : ''}${i === pop ? ' pop' : ''}">♥</span>`;
  return `<div class="hearts">${h}</div>`;
}

function dietText(def) {
  const f = (id) => `${FRUITS[id].emoji}${FRUITS[id].name}`;
  if (def.diet.type === 'only') return `只吃 ${def.diet.foods.map(f).join('、')}`;
  if (def.diet.type === 'attr') return `只吃${ATTRS[def.attr].name}的水果，最喜歡 ${f(def.diet.fav)}（+2）`;
  return `什麼水果都吃，最喜歡 ${f(def.diet.fav)}（+2）`;
}

function skillsHTML(def, lv) {
  return `<div class="skill-list">${def.skills
    .map((s) => {
      const on = lv >= s.lv;
      const S = SKILLS[s.type];
      return `<div class="skill ${on ? 'on' : 'off'}"><span class="lv">Lv${s.lv}</span><span>${S.icon} <b>${S.name}</b>・${S.text(s.v)}</span></div>`;
    })
    .join('')}</div>`;
}

function speciesHead(def, extra = '') {
  const R = RARITY[def.rarity];
  return `<div class="creature-hero"><div class="big r${def.rarity}">${creatureIcon(def)}</div>
    <div class="grow"><h3>${esc(def.name)}</h3>
    <div class="row wrap"><span class="tag r${def.rarity}">${R.stars} ${R.name}</span><span class="tag attr-${def.attr}">${ATTRS[def.attr].name}</span></div>
    ${extra}</div></div><p class="muted">${esc(def.desc)}</p>`;
}

function renderCreatureSheet(data) {
  if (data.tamed) {
    const c = G.findCreature(state, data.tamed.uid);
    const def = CREATURES[c.sid];
    const msg = data.tamed.toParty
      ? '牠會跟在你後面一起探險，並帶來能力加成！'
      : '隊伍已經滿了，牠先回地底小窩等你。到小窩的搖鈴區就能呼喚牠。';
    return {
      title: '🎉 交到新朋友了',
      html: `<div class="tamed-banner"><div class="big-emo">${creatureIcon(def)}</div><h3>${esc(def.name)}成為你的夥伴了！</h3><p class="muted">${msg}</p></div>
        <h3>能力（跟著走路會升級）</h3>${skillsHTML(def, c.lv)}
        <p style="margin-top:14px"><button class="btn primary block" data-close>太好了！</button></p>`,
    };
  }
  const t = state.dungeon && G.tileAt(state.dungeon, data.x, data.y);
  if (!t || !t.ent || t.ent.type !== 'creature') return null;
  const e = t.ent;
  const def = CREATURES[e.sid];
  const fruits = Object.keys(FRUITS).filter((id) => G.invCount(state, id) > 0);
  const buttons = fruits
    .map((id) => {
      const v = G.feedValue(def, id);
      const cls = v >= 2 ? ' fav' : v <= 0 ? ' no' : '';
      const label = v >= 2 ? `♥+${v} 最愛` : v > 0 ? `♥+${v}` : '不吃';
      return `<button class="fruit-btn${cls}" data-act="feed" data-fid="${id}"><span class="emo">${FRUITS[id].emoji}</span>${esc(FRUITS[id].name)} ×${state.inv[id]}<span class="val">${label}</span></button>`;
    })
    .join('');
  const feed = fruits.length
    ? `<div class="fruit-grid">${buttons}</div>`
    : '<p class="empty">你身上沒有水果。<br>地牢裡的果樹、寶箱和商人都能取得水果。</p>';
  return {
    title: '地牢生物',
    html: `${speciesHead(def, `<div style="margin-top:6px">${hearts(e.aff, def.need, data.pop ?? -1)}</div><div class="fine">好感度 ${e.aff} / ${def.need}</div>`)}
      <div class="card"><b>飲食：</b>${dietText(def)}</div>
      <h3>餵牠水果</h3>${feed}
      <h3>成為夥伴後的能力</h3>${skillsHTML(def, 0)}`,
  };
}

function renderSpecies(data) {
  const def = CREATURES[data.sid];
  const dex = state.dex[data.sid] || { seen: 0, tamed: 0 };
  const owned = state.creatures.filter((c) => c.sid === data.sid);
  return {
    title: '📖 圖鑑',
    html: `${speciesHead(def, `<div class="fine">已收服 ${dex.tamed} 次${owned.length ? `・目前擁有 ${owned.length} 隻` : ''}</div>`)}
      <div class="card"><b>飲食：</b>${dietText(def)}<br><b>需要好感度：</b>${def.need}</div>
      <h3>能力</h3>${skillsHTML(def, owned.length ? Math.max(...owned.map((c) => c.lv)) : 0)}
      <p style="margin-top:14px"><button class="btn block" data-act="open" data-name="dex">返回圖鑑</button></p>`,
  };
}

const MERCHANT_LINES = ['嘿嘿，走過路過不要錯過～', '今天有好貨喔！', '錢幣準備好了嗎？', '這些都是我從各地收集來的寶貝！', '要買點水果餵朋友嗎？'];

function renderShop(data) {
  const t = state.dungeon && G.tileAt(state.dungeon, data.x, data.y);
  if (!t || !t.ent || t.ent.type !== 'merchant') return null;
  const m = t.ent;
  const line = MERCHANT_LINES[(data.x * 3 + data.y + state.floor) % MERCHANT_LINES.length];
  const rows = m.stock
    .map((s, i) => {
      const price = G.priceOf(state, s);
      const def = G.defOf(s.id).def;
      const priceHTML = price < s.price ? `<s>${s.price}</s> ${price}` : price;
      const btn = s.qty <= 0
        ? '<button class="btn small" disabled>賣完了</button>'
        : `<button class="btn small primary" data-act="buy" data-i="${i}" ${state.coins < price ? 'disabled' : ''}>購買</button>`;
      return `<div class="item-row"><div class="item-icon"><span class="emo">${def.emoji}</span></div>
        <div class="item-main"><div class="item-name">${esc(def.name)} ${kindTag(s.id)}</div>
        <div class="item-desc">${esc(def.desc || '可以擺在地底小窩的家具。')}</div>
        <div class="row"><span class="price"><i class="coin-ic"></i>${priceHTML}</span><span class="fine">剩 ${s.qty} 個</span></div></div>${btn}</div>`;
    })
    .join('');
  return {
    title: `${MERCHANT.emoji} ${MERCHANT.name}`,
    html: `<div class="merchant-talk"><span class="emo">${MERCHANT.emoji}</span><div class="bubble">${line}</div></div>
      <p class="row"><span class="wallet"><i class="coin-ic"></i>${state.coins}</span>${G.getBonuses(state).bargain > 0 ? '<span class="tag on">🏷️ 殺價中</span>' : ''}</p>${rows}`,
  };
}

function bonusSummary() {
  const b = G.getBonuses(state);
  const items = Object.entries(SKILLS)
    .filter(([k]) => b[k] > 0)
    .map(([k, S]) => `<div class="bonus">${S.icon} ${S.name}<b>${S.bool ? '有' : k === 'vision' ? `+${b[k]}` : `${Math.round(b[k] * 100)}%`}</b></div>`);
  return items.length ? `<div class="bonus-grid">${items.join('')}</div>` : '<p class="fine">目前沒有能力加成。</p>';
}

function memberHTML(c, actions = '') {
  const def = CREATURES[c.sid];
  const xp = G.expProgress(c);
  return `<div class="item-row member"><div class="item-icon">${creatureIcon(def)}</div><div class="item-main">
    <div class="item-name">${esc(def.name)} <small>Lv${c.lv}</small> <span class="tag r${def.rarity}">${RARITY[def.rarity].name}</span></div>
    <span class="bar exp-bar"><i style="width:${xp.max ? 100 : Math.round((xp.cur / xp.need) * 100)}%"></i></span>
    <div class="fine">${xp.max ? '已經是最高等級' : `再一起走 ${xp.need - xp.cur} 步升級`}・一起走了 ${c.exp} 步</div>
    ${skillsHTML(def, c.lv)}</div>${actions}</div>`;
}

function renderParty() {
  const members = state.party.map((uid) => G.findCreature(state, uid)).filter(Boolean);
  const list = members.length
    ? members.map((c) => memberHTML(c)).join('')
    : '<p class="empty">還沒有夥伴跟著你。<br>在地牢裡遇到生物時，餵牠水果就能交朋友！</p>';
  const foot = state.scene === 'nest'
    ? '<button class="btn primary block" data-act="open" data-name="bell">🔔 到搖鈴區更換隊伍</button>'
    : '<p class="fine">要更換隊伍，請踩進鼴鼠洞回到地底小窩，在搖鈴區呼喚夥伴。</p>';
  return {
    title: `🐾 隊伍（${members.length}/${PARTY_MAX}）`,
    html: `<h3>能力加成</h3>${bonusSummary()}<h3>跟在你後面的夥伴</h3>${list}<p class="fine">共收服 ${state.creatures.length} 隻夥伴。</p>${foot}`,
  };
}

function renderBell() {
  if (state.scene !== 'nest') return null;
  const all = state.creatures.slice().sort((a, b) => (state.party.includes(b.uid) - state.party.includes(a.uid)) || b.lv - a.lv);
  const slots = [];
  for (let i = 0; i < PARTY_MAX; i++) {
    const c = G.findCreature(state, state.party[i]);
    slots.push(c
      ? `<button class="party-slot filled" data-act="party" data-uid="${c.uid}" title="讓牠休息">${creatureIcon(CREATURES[c.sid])}</button>`
      : '<span class="party-slot"></span>');
  }
  const rows = all.length
    ? all
        .map((c) => {
          const inParty = state.party.includes(c.uid);
          const full = !inParty && state.party.length >= PARTY_MAX;
          const btn = `<button class="btn small ${inParty ? '' : 'primary'}" data-act="party" data-uid="${c.uid}" ${full ? 'disabled' : ''}>${inParty ? '休息' : '加入'}</button>`;
          return memberHTML(c, btn);
        })
        .join('')
    : '<p class="empty">還沒有收服任何生物。<br>在地牢裡餵生物吃水果，好感度滿了就會成為夥伴！</p>';
  return {
    title: '🔔 搖鈴區',
    html: `<p class="muted">搖響鈴鐺，呼喚以前收服的夥伴。最多 ${PARTY_MAX} 隻會跟在你後面一起探險，其他夥伴會在小窩裡休息。</p>
      <div class="nest-party" style="justify-content:flex-start"><span>目前隊伍</span>${slots.join('')}</div>
      <h3>所有夥伴（${all.length}）</h3>${rows}`,
  };
}

function renderDex() {
  const total = Object.keys(CREATURES).length;
  const seen = Object.keys(CREATURES).filter((id) => state.dex[id] && state.dex[id].seen).length;
  const tamed = Object.keys(CREATURES).filter((id) => state.dex[id] && state.dex[id].tamed).length;
  const groups = ATTR_IDS.map((attr) => {
    const cards = Object.entries(CREATURES)
      .filter(([, c]) => c.attr === attr)
      .map(([id, c]) => {
        const e = state.dex[id];
        if (!e || !e.seen) {
          return `<div class="dex-card unknown">${creatureIcon(c)}<div class="nm">？？？</div><div class="fine">${RARITY[c.rarity].stars}</div></div>`;
        }
        return `<button class="dex-card" data-act="species" data-sid="${id}">${creatureIcon(c)}<div class="nm">${esc(c.name)}</div><div class="fine">${RARITY[c.rarity].stars}</div>${e.tamed ? `<div class="tm">♥ ×${e.tamed}</div>` : '<div class="fine">已發現</div>'}</button>`;
      })
      .join('');
    return `<h3><span class="tag attr-${attr}">${ATTRS[attr].name}</span> ${ATTRS[attr].dungeon}</h3><div class="dex-grid">${cards}</div>`;
  }).join('');
  return { title: '📖 生物圖鑑', html: `<p class="muted">已發現 ${seen} / ${total} 種・已收服 ${tamed} 種</p>${groups}` };
}

// ── 計步面板 ──

const METHODS = [
  { id: 'auto', icon: '✨', title: '自動（推薦）', desc: '依序嘗試 GPS → 搖晃計步 → 其他方式' },
  { id: 'gps', icon: '📡', title: 'GPS 定位', desc: '依實際移動距離計算，每 50 公尺 = 1 步' },
  { id: 'motion', icon: '📳', title: '搖晃計步', desc: '手機每搖一下（或走一步）記 1 次，50 次 = 1 步' },
  { id: 'ble', icon: '🔵', title: '藍牙跑步機／計步器', desc: '連接支援 FTMS 的跑步機、步行墊，或 RSC 足部感應器' },
  { id: 'manual', icon: '✍️', title: '手動同步健康 App', desc: '輸入「健康」或 Google Fit 的今日步行距離' },
];

function trackerLiveHTML() {
  const s = tracker.state;
  const { text } = trackerPillText(s);
  const acc = s.method === 'gps' && s.accuracy ? `<div class="fine">GPS 精度：±${Math.round(s.accuracy)} 公尺${s.signal === 'weak' ? '（訊號弱，暫停計算）' : ''}</div>` : '';
  const today = state.daily.date === G.todayStr() ? state.daily.units : 0;
  return `<div class="card"><div><b>${esc(text)}</b></div>${acc}
    <div class="fine">本次啟動累積：${unitIsShake() ? `${Math.round(s.sessionUnits)} 次` : km(s.sessionUnits)}・距離下一步：${remainingText().replace('再', '還要')}</div></div>
    <div class="stat-grid" style="margin-top:8px">
      <div class="card"><b>${km(today)}</b><span>今天</span></div>
      <div class="card"><b>${km(state.stats.units)}</b><span>累計</span></div>
      <div class="card"><b>${state.stats.stepsEarned}</b><span>走路得到的步數</span></div>
    </div>`;
}

function renderTrackerSheet() {
  const s = tracker.state;
  const caps = capabilities();
  const running = s.phase !== 'idle';
  let action = '';
  if (s.phase === 'need-gesture') {
    action = `<div class="card stack"><span>GPS 無法使用，接下來改用<b>搖晃計步</b>，需要你授權動作感測：</span>
      <button class="btn primary block" data-act="grant-motion">📳 點此啟用搖晃計步</button>
      <span class="fine">也可以改用：</span>
      <div class="row"><button class="btn small grow" data-act="ble" ${caps.ble ? '' : 'disabled'}>🔵 藍牙裝置</button>
      <button class="btn small grow" data-act="manual">✍️ 手動同步</button></div></div>`;
  } else if (s.phase === 'choose') {
    action = `<div class="card"><p><b>GPS 和搖晃計步都無法使用</b>，請改用其他方式：</p>
      <div class="stack"><button class="btn block" data-act="ble" ${caps.ble ? '' : 'disabled'}>🔵 連接藍牙跑步機／計步器</button>
      ${caps.ble ? '' : '<span class="fine">這個瀏覽器不支援 Web Bluetooth（Android 或電腦版 Chrome 才有）。</span>'}
      <button class="btn block primary" data-act="manual">✍️ 手動同步健康 App 的距離</button></div></div>`;
  }
  let manual = '';
  if (s.method === 'manual' && s.phase === 'active') {
    const today = state.daily.date === G.todayStr() ? state.daily.units : 0;
    manual = `<h3>同步健康 App</h3><div class="card stack">
      <span class="fine">打開手機的「健康」、Google Fit 或手環 App，輸入<b>今天的總步行距離</b>（或總步數）：</span>
      <div class="field"><input id="sync-km" type="number" inputmode="decimal" min="0" step="0.01" placeholder="例如 3.2"><span>公里</span></div>
      <div class="field"><input id="sync-steps" type="number" inputmode="numeric" min="0" step="1" placeholder="或輸入步數，例如 4500"><span>步</span></div>
      <button class="btn primary" data-act="sync">同步</button>
      <span class="fine">今天已累積 ${km(today)}，只會補上還沒算進去的部分。步數以每步 0.7 公尺換算。</span></div>`;
  }
  const methods = METHODS.map((m) => {
    const unavailable = (m.id === 'gps' && !caps.gps) || (m.id === 'motion' && !caps.motion) || (m.id === 'ble' && !caps.ble);
    const on = s.pref === m.id && running;
    return `<button class="method${on ? ' on' : ''}" data-act="method" data-m="${m.id}" ${unavailable ? 'disabled' : ''}>
      <span class="emo">${m.icon}</span><span class="grow"><div class="m-title">${m.title}${unavailable ? '（不支援）' : ''}</div><div class="m-desc">${m.desc}</div></span></button>`;
  }).join('');
  const attempts = s.log.length
    ? `<h3>啟動紀錄</h3><ul class="log-list">${s.log.map((l) => `<li>${l.ok ? '✅' : '❌'} ${METHOD_LABEL[l.method]}：${esc(l.msg)}</li>`).join('')}</ul>`
    : '';
  const sens = s.method === 'motion' || s.pref === 'motion'
    ? `<h3>搖晃靈敏度</h3><div class="seg">${[['low', '低'], ['mid', '中'], ['high', '高']].map(([k, n]) => `<button class="${state.tracker.sensitivity === k ? 'on' : ''}" data-act="sens" data-v="${k}">${n}</button>`).join('')}</div>`
    : '';
  const dev = DEV
    ? `<h3>開發者工具</h3><div class="row wrap">
      <button class="btn small" data-act="dev-units" data-n="50">走 50 公尺</button>
      <button class="btn small" data-act="dev-steps" data-n="10">+10 步</button>
      <button class="btn small" data-act="dev-coins">+50 錢幣</button>
      <button class="btn small" data-act="dev-fruits">每種水果 +3</button>
      <button class="btn small" data-act="dev-items">每種道具 +1</button>
      <button class="btn small" data-act="dev-floor">換新樓層</button></div>`
    : '';
  return {
    title: '👣 計步',
    html: `<div id="trk-live">${trackerLiveHTML()}</div>${action}${manual}
      <p class="row" style="margin-top:12px">${running
        ? '<button class="btn danger grow" data-act="stop">暫停計步</button>'
        : '<button class="btn primary grow" data-act="start">開始計步</button>'}</p>
      ${attempts}
      <h3>計步方式</h3><div class="method-list">${methods}</div>
      ${sens}
      <h3>其他</h3>
      <label class="switch"><span>走路時保持螢幕常亮<br><span class="fine">網頁在螢幕關閉或切到背景時無法計步</span></span><input type="checkbox" data-act="wake" ${state.tracker.wake ? 'checked' : ''}></label>
      <p class="fine">・GPS：會過濾原地飄移與精度太差的定位，時速超過約 16 公里（搭車）不計算。螢幕關閉一段時間後回來，若平均速度合理會補算直線距離。<br>
      ・搖晃計步：手機每搖一下（或走路時的每一步）記 1 次，滿 50 次換 1 步。<br>
      ・藍牙：讀取跑步機或足部感應器回報的實際距離。</p>${dev}`,
  };
}

function renderSettings(data) {
  const st = state.stats;
  const code = data.export ? `<textarea readonly id="export-box">${esc(exportSave(state))}</textarea><p class="fine">複製這段文字保存，之後可以在「匯入」貼上還原進度。</p>` : '';
  return {
    title: '⚙️ 設定',
    html: `<label class="switch"><span>音效</span><input type="checkbox" data-act="sound" ${state.settings.sound ? 'checked' : ''}></label>
      <label class="switch"><span>震動回饋</span><input type="checkbox" data-act="vibrate" ${state.settings.vibrate ? 'checked' : ''}></label>
      <h3>冒險紀錄</h3>
      <div class="stat-grid">
        <div class="card"><b>${state.floor}</b><span>最深樓層</span></div>
        <div class="card"><b>${st.moves}</b><span>地牢中移動</span></div>
        <div class="card"><b>${st.chests}</b><span>打開寶箱</span></div>
        <div class="card"><b>${st.coins}</b><span>撿到錢幣</span></div>
        <div class="card"><b>${st.tamed}</b><span>收服生物</span></div>
        <div class="card"><b>${km(st.units)}</b><span>走路累計</span></div>
      </div>
      <h3>存檔</h3>
      <p class="fine">進度會自動存在這個瀏覽器裡。換手機或清除瀏覽資料前，記得先匯出。</p>
      <div class="row"><button class="btn grow" data-act="export">匯出存檔</button><button class="btn grow" data-act="import">匯入存檔</button></div>
      ${code}
      ${data.import ? '<textarea id="import-box" placeholder="貼上 WD1: 開頭的存檔文字"></textarea><p><button class="btn primary block" data-act="do-import">確認匯入</button></p>' : ''}
      <h3>重新開始</h3>
      <button class="btn danger block" data-act="reset">${data.resetArmed ? '再按一次確認：刪除所有進度' : '刪除進度並重新開始'}</button>
      <h3>關於</h3>
      <p class="fine">步行地牢 v${VERSION}・每走 50 公尺得 1 步，用步數探索隨機地牢。<br>
      <a href="https://github.com/Dot7dot/Walking-Dungeon" target="_blank" rel="noopener" style="color:var(--gold)">GitHub 原始碼</a></p>`,
  };
}

// ── 面板裡的按鈕 ──

function useItemFromBag(id) {
  const d = state.dungeon;
  const seenBefore = d ? new Set(d.tiles.filter((t) => t.seen)) : new Set();
  const r = G.useItem(state, id);
  if (!r.ok) {
    sfx('error');
    toast(r.msg, 'bad');
    refreshSheet();
    return;
  }
  closeSheet();
  const fresh = state.dungeon.tiles.filter((t) => t.seen && !seenBefore.has(t));
  renderTiles(fresh);
  renderActors();
  updateCtx();
  handleEvents(r.events);
  persist();
}

function feed(fid) {
  const { x, y } = sheet.data;
  const before = G.tileAt(state.dungeon, x, y)?.ent?.aff ?? 0;
  const r = G.feedCreature(state, x, y, fid);
  if (!r.ok) {
    sfx('error');
    toast(r.msg, 'bad');
    refreshSheet();
    return;
  }
  sfx('feed');
  buzz(15);
  floatAt(x, y, `♥+${r.gain}`, 'heart');
  if (r.bonus) toast('💕 魅力發動！好感度額外 +1', 'good', 1600);
  else if (r.fav) toast(`${creatureIcon(CREATURES[r.sid])} 好開心！這是牠最喜歡的水果`, 'good', 1600);
  if (r.tamed) {
    sfx('tame');
    buzz([30, 50, 30, 50, 80]);
    sheet.data.tamed = { uid: r.creature.uid, toParty: r.toParty };
    renderTiles();
    renderActors();
    log(`${creatureIcon(CREATURES[r.sid])} <b>${CREATURES[r.sid].name}</b> 成為你的夥伴了！`);
  } else {
    sheet.data.pop = Math.min(r.aff, r.need) - 1;
    renderTiles();
  }
  refreshSheet();
  persist();
}

function onSheetAction(act, el) {
  const ds = el.dataset;
  switch (act) {
    case 'yes': {
      const fn = sheet && sheet.data.onYes;
      closeSheet();
      if (fn) fn();
      break;
    }
    case 'no':
      closeSheet();
      break;
    case 'open':
      openSheet(ds.name);
      break;
    case 'tab':
      sheet.data.tab = ds.tab;
      refreshSheet(true);
      break;
    case 'use':
      useItemFromBag(ds.id);
      break;
    case 'place':
      closeSheet();
      editMode = true;
      selectedFurniture = ds.id;
      renderNest();
      break;
    case 'feed':
      feed(ds.fid);
      break;
    case 'buy': {
      const r = G.buy(state, sheet.data.x, sheet.data.y, Number(ds.i));
      if (!r.ok) {
        sfx('error');
        toast(r.msg, 'bad');
      } else {
        sfx('buy');
        toast(`買到了 ${itemIcon(r.id)} ${itemName(r.id)}`, 'good', 1500);
        renderHud();
        persist();
      }
      refreshSheet();
      break;
    }
    case 'party': {
      const r = G.toggleParty(state, ds.uid);
      if (!r.ok) toast(r.msg, 'bad');
      else {
        sfx(r.joined ? 'bell' : 'step');
        if (r.joined) {
          const c = G.findCreature(state, ds.uid);
          toast(`${creatureIcon(CREATURES[c.sid])} ${CREATURES[c.sid].name} 加入隊伍！`, 'good', 1400);
        }
      }
      persist();
      refreshSheet();
      renderNest();
      break;
    }
    case 'species':
      openSheet('species', { sid: ds.sid });
      break;
    case 'method': {
      const m = ds.m;
      startTracking(m, { gesture: true });
      refreshSheet();
      break;
    }
    case 'start':
      startTracking(state.tracker.pref, { gesture: true });
      refreshSheet();
      break;
    case 'stop':
      stopTracking();
      refreshSheet();
      break;
    case 'grant-motion':
      tracker.grantMotion();
      break;
    case 'ble':
      tracker.connectBle();
      break;
    case 'manual':
      tracker.useManual();
      break;
    case 'sync': {
      const kmVal = parseFloat($('#sync-km').value);
      const stepsVal = parseFloat($('#sync-steps').value);
      const meters = Number.isFinite(kmVal) && kmVal > 0 ? kmVal * 1000 : Number.isFinite(stepsVal) && stepsVal > 0 ? stepsVal * 0.7 : NaN;
      const r = G.manualSync(state, meters);
      if (!r.ok) {
        sfx('error');
        toast(r.msg, 'bad');
        return;
      }
      sfx('gain');
      toast(`同步完成：補上 ${km(r.credit)}，得到 <b>${r.gained}</b> 步！`, 'good');
      renderHud();
      persist();
      refreshSheet();
      break;
    }
    case 'sens':
      state.tracker.sensitivity = ds.v;
      tracker.setSensitivity(ds.v);
      persist();
      refreshSheet();
      break;
    case 'export':
      sheet.data.export = true;
      sheet.data.import = false;
      refreshSheet();
      setTimeout(() => $('#export-box') && $('#export-box').select(), 50);
      break;
    case 'import':
      sheet.data.import = true;
      sheet.data.export = false;
      refreshSheet();
      break;
    case 'do-import': {
      const s = importSave($('#import-box').value);
      if (!s) {
        toast('存檔格式不正確', 'bad');
        return;
      }
      state = s;
      state.started = true;
      if (state.scene === 'dungeon' && !state.dungeon) G.enterNewFloor(state);
      persist(true);
      closeSheet();
      setSoundEnabled(state.settings.sound);
      render();
      toast('匯入完成！', 'good');
      break;
    }
    case 'reset':
      if (!sheet.data.resetArmed) {
        sheet.data.resetArmed = true;
        refreshSheet();
        return;
      }
      stopTracking();
      clearSave();
      location.reload();
      break;
    case 'dev-units':
      onUnits(Number(ds.n));
      break;
    case 'dev-steps':
      state.steps += Number(ds.n);
      renderHud();
      persist();
      break;
    case 'dev-coins':
      state.coins += 50;
      renderHud();
      persist();
      break;
    case 'dev-fruits':
      for (const id of Object.keys(FRUITS)) G.addInv(state, id, 3);
      persist();
      toast('每種水果 +3');
      break;
    case 'dev-items':
      for (const id of Object.keys(ITEMS)) G.addInv(state, id, 1);
      persist();
      toast('每種道具 +1');
      break;
    case 'dev-floor':
      closeSheet();
      G.enterNewFloor(state);
      render();
      floorIntro();
      persist();
      break;
    default:
      break;
  }
}

function onSheetChange(act, el) {
  if (act === 'sound') {
    state.settings.sound = el.checked;
    setSoundEnabled(el.checked);
    if (el.checked) sfx('coin');
  } else if (act === 'vibrate') {
    state.settings.vibrate = el.checked;
    buzz(30);
  } else if (act === 'wake') {
    state.tracker.wake = el.checked;
    if (el.checked) requestWake();
    else releaseWake();
  }
  persist();
}

// ───────────────────────── 標題畫面 ─────────────────────────

function showTitle() {
  $('#title-art').innerHTML = [
    ['sand', '<i class="coin-ic" style="width:24px;height:24px"></i>'],
    ['sand', chestSVG('sand')],
    ['sand', '<span class="emo">🦎</span>'],
    ['forest', '<span class="emo">🐿️</span>'],
    ['forest', playerSVG('down')],
    ['forest', '<span class="emo">🍎</span>'],
    ['swamp', '<span class="emo">🐸</span>'],
    ['swamp', holeSVG()],
    ['swamp', exitSVG('swamp')],
  ].map(([attr, inner]) => `<div class="t ${attr}">${inner}</div>`).join('');
  $('#title-screen').hidden = false;
  $('#title-start').addEventListener('click', () => {
    state.started = true;
    if (!state.dungeon && state.floor === 0) G.enterNewFloor(state, Math.random, { tutorial: true });
    $('#title-screen').hidden = true;
    render();
    persist(true);
    startTracking('auto', { gesture: true });
    sfx('chest');
    toast('🎁 見面禮：送你 10 步！', 'good', 3000);
    log('點旁邊的地塊或用方向鍵移動，每走一格消耗 1 步。前面那隻生物可以餵水果交朋友！');
  }, { once: true });
}

// ───────────────────────── 操作綁定 ─────────────────────────

function bindInput() {
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      openSheet(open.dataset.open);
      return;
    }
    if (e.target.closest('[data-close]')) closeSheet();
  });

  $('#tracker-pill').addEventListener('click', () => {
    const s = tracker.state;
    if (s.phase === 'need-gesture') {
      tracker.grantMotion();
      return;
    }
    if (s.phase === 'idle' && state.started && state.tracker.pref !== 'manual') {
      startTracking(state.tracker.pref, { gesture: true });
      toast('開始計步！帶著手機出門走走吧 👣', 'good', 2000);
      return;
    }
    openSheet('tracker');
  });

  $('#sheet-body').addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.matches('input')) return;
    onSheetAction(el.dataset.act, el);
  });
  $('#sheet-body').addEventListener('change', (e) => {
    const el = e.target.closest('input[data-act]');
    if (el) onSheetChange(el.dataset.act, el);
  });

  for (const b of $$('[data-move]')) b.addEventListener('click', () => doMove(b.dataset.move));
  $('#ctx-btn').addEventListener('click', ctxAction);

  $('#tiles').addEventListener('click', (e) => {
    if (suppressClick) return;
    const el = e.target.closest('.tile');
    if (!el || !state.dungeon) return;
    const x = Number(el.dataset.x);
    const y = Number(el.dataset.y);
    const p = state.dungeon.player;
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      doMove(dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up');
    } else if (dx === 0 && dy === 0) {
      const t = G.tileAt(state.dungeon, x, y);
      if (t.ent && t.ent.type === 'exit') confirmExit();
      else if (t.ent && t.ent.type === 'hole') confirmHole();
    } else {
      const info = tileInfo(G.tileAt(state.dungeon, x, y), state.dungeon);
      if (info && info !== '空地') toast(info, '', 1600);
    }
  });

  // 在地牢上滑動也可以移動
  let start = null;
  const board = $('#board');
  board.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY };
  });
  board.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 32) return;
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 300);
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
    else doMove(dy > 0 ? 'down' : 'up');
  });
  board.addEventListener('pointercancel', () => {
    start = null;
  });

  $('#nest-grid').addEventListener('click', (e) => {
    const el = e.target.closest('.nest-cell');
    if (el) onNestCell(Number(el.dataset.x), Number(el.dataset.y));
  });
  $('#tray').addEventListener('click', (e) => {
    const el = e.target.closest('[data-furn]');
    if (!el) return;
    selectedFurniture = selectedFurniture === el.dataset.furn ? null : el.dataset.furn;
    renderTray();
  });
  for (const b of $$('[data-nest]')) {
    b.addEventListener('click', () => {
      const a = b.dataset.nest;
      if (a === 'bell') {
        sfx('bell');
        openSheet('bell');
      } else if (a === 'decorate') {
        editMode = !editMode;
        if (!editMode) selectedFurniture = null;
        renderNest();
      } else if (a === 'leave') confirmLeaveNest();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input, textarea')) return;
    if (e.key === 'Escape') {
      if (sheet) closeSheet();
      return;
    }
    if (sheet || !$('#title-screen').hidden || state.scene !== 'dungeon') return;
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    };
    if (map[e.key]) {
      e.preventDefault();
      doMove(map[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ctxAction();
    }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!$('#title-screen').hidden) return;
      if (state.scene === 'dungeon' && state.dungeon) renderDungeon();
      else renderNest();
    }, 120);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWake();
    else persist(true);
  });
  window.addEventListener('pagehide', () => persist(true));
}

// ───────────────────────── 啟動 ─────────────────────────

function boot() {
  setSoundEnabled(state.settings.sound);
  tracker = new StepTracker({ onUnits, onChange: onTrackerChange, sensitivity: state.tracker.sensitivity });
  bindInput();
  renderTrackerPill();
  if (!state.started) {
    if (!state.dungeon) G.enterNewFloor(state, Math.random, { tutorial: true });
    render();
    showTitle();
  } else {
    if (state.scene === 'dungeon' && !state.dungeon) G.enterNewFloor(state);
    render();
    if (state.scene === 'dungeon') log(`歡迎回來！${idleSummary()}`);
    if (state.tracker.running && state.tracker.pref !== 'ble') startTracking(state.tracker.pref, { gesture: false });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (DEV) window.__wd = { get state() { return state; }, G, tracker, render };
}

boot();
