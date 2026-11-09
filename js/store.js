// 存檔：預設狀態、localStorage 讀寫、匯出／匯入
import { START_STEPS, START_COINS, START_FRUITS, FRUITS } from './data.js';

export const SAVE_KEY = 'walking-dungeon/save/v1';

export function defaultState() {
  return {
    v: 1,
    started: false,
    steps: START_STEPS,
    progress: 0,
    coins: START_COINS,
    floor: 0,
    inv: { ...Object.fromEntries(Object.keys(FRUITS).map((id) => [id, START_FRUITS])), mole_snack: 1 },
    creatures: [],
    party: [],
    nextUid: 1,
    scene: 'dungeon',
    dungeon: null,
    nest: { placed: [] },
    dex: {},
    daily: { date: '', units: 0 },
    tracker: { pref: 'auto', running: false, sensitivity: 'mid', wake: true },
    settings: { sound: true, vibrate: true },
    stats: {
      units: 0, stepsEarned: 0, moves: 0, coins: 0, spent: 0, chests: 0, fruits: 0,
      fed: 0, tamed: 0, floors: 0, nestVisits: 0, itemsUsed: 0,
    },
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** 用預設值補齊舊存檔缺少的欄位 */
export function normalize(raw) {
  if (!isObj(raw)) return null;
  const base = defaultState();
  const s = { ...base, ...raw };
  for (const k of ['nest', 'daily', 'tracker', 'settings', 'stats']) {
    s[k] = { ...base[k], ...(isObj(raw[k]) ? raw[k] : {}) };
  }
  for (const k of ['inv', 'dex']) if (!isObj(s[k])) s[k] = {};
  for (const k of ['creatures', 'party']) if (!Array.isArray(s[k])) s[k] = [];
  if (!Array.isArray(s.nest.placed)) s.nest.placed = [];
  for (const k of ['steps', 'progress', 'coins', 'floor', 'nextUid']) {
    if (!Number.isFinite(s[k])) s[k] = base[k];
  }
  s.party = s.party.filter((uid) => s.creatures.some((c) => c.uid === uid));
  if (s.scene !== 'nest' && s.scene !== 'dungeon') s.scene = 'dungeon';
  if (s.scene === 'dungeon' && !isObj(s.dungeon)) s.dungeon = null;
  return s;
}

export function load(storage = globalThis.localStorage) {
  try {
    const text = storage && storage.getItem(SAVE_KEY);
    return text ? normalize(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportSave(state) {
  return `WD1:${toBase64(JSON.stringify(state))}`;
}

export function importSave(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('WD1:')) return null;
  try {
    return normalize(JSON.parse(fromBase64(t.slice(4))));
  } catch {
    return null;
  }
}
