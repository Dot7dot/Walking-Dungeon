// 遊戲規則（純邏輯，不碰 DOM）：地牢生成、移動、餵食、商店、道具、小窩
import {
  STEP_UNITS, PARTY_MAX, LEVEL_EXP, MAX_LEVEL, SIZE_TABLE, SIZE_CONTENT, ATTR_IDS,
  FRUITS, ITEMS, FURNITURE, CREATURES, SKILLS, CHEST_LOOT, RARITY_WEIGHTS,
  NEST_W, NEST_H, NEST_FIXED,
} from './data.js';
import { randInt, pick, weighted, shuffle } from './rng.js';

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function todayStr(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// ───────────────────────── 物品 ─────────────────────────

export function defOf(id) {
  if (FRUITS[id]) return { kind: 'fruit', def: FRUITS[id] };
  if (ITEMS[id]) return { kind: 'item', def: ITEMS[id] };
  if (FURNITURE[id]) return { kind: 'furniture', def: FURNITURE[id] };
  return null;
}

export const invCount = (state, id) => state.inv[id] || 0;

export function addInv(state, id, n = 1) {
  const v = (state.inv[id] || 0) + n;
  if (v > 0) state.inv[id] = v;
  else delete state.inv[id];
}

// ───────────────────────── 步數 ─────────────────────────

/** 把走路量（公尺或搖晃次數）換算成步數，回傳這次新增的步數 */
export function addUnits(state, units, date = todayStr()) {
  if (!Number.isFinite(units) || units <= 0) return 0;
  if (state.daily.date !== date) state.daily = { date, units: 0 };
  state.daily.units += units;
  state.stats.units += units;
  state.progress += units;
  let gained = 0;
  while (state.progress >= STEP_UNITS) {
    state.progress -= STEP_UNITS;
    state.steps += 1;
    gained += 1;
  }
  state.stats.stepsEarned += gained;
  return gained;
}

/**
 * 手動同步健康 App：輸入「今天總共走了幾公尺」，
 * 只補上今天還沒被其他方式算進去的部分，避免重複計算。
 */
export function manualSync(state, meters, date = todayStr()) {
  if (!Number.isFinite(meters) || meters <= 0) return { ok: false, msg: '請輸入大於 0 的數值' };
  if (meters > 100000) return { ok: false, msg: '一天走超過 100 公里？請再確認一次數值' };
  if (state.daily.date !== date) state.daily = { date, units: 0 };
  const credit = meters - state.daily.units;
  if (credit < 1) {
    return { ok: false, msg: `今天已經累積 ${Math.round(state.daily.units)} 公尺，請輸入比這更大的今日總距離` };
  }
  const gained = addUnits(state, credit, date);
  return { ok: true, credit, gained };
}

// ───────────────────────── 生物與能力 ─────────────────────────

export const findCreature = (state, uid) => state.creatures.find((c) => c.uid === uid) || null;

export function levelForExp(exp) {
  let lv = 1;
  for (let L = 2; L <= MAX_LEVEL; L++) if (exp >= LEVEL_EXP[L]) lv = L;
  return lv;
}

export function expProgress(c) {
  if (c.lv >= MAX_LEVEL) return { cur: 1, need: 1, max: true };
  const base = LEVEL_EXP[c.lv];
  return { cur: c.exp - base, need: LEVEL_EXP[c.lv + 1] - base, max: false };
}

/** 已解鎖的技能（同類型取最高值，代表升級） */
export function unlockedSkills(c) {
  const best = new Map();
  for (const s of CREATURES[c.sid].skills) {
    if (s.lv > c.lv) continue;
    const b = best.get(s.type);
    if (!b || s.v >= b.v) best.set(s.type, s);
  }
  return [...best.values()];
}

export function emptyBonuses() {
  const b = {};
  for (const k of Object.keys(SKILLS)) b[k] = 0;
  return b;
}

/** 隊伍帶來的能力加成總和 */
export function getBonuses(state) {
  const b = emptyBonuses();
  for (const uid of state.party) {
    const c = findCreature(state, uid);
    if (!c) continue;
    for (const s of unlockedSkills(c)) b[s.type] += s.v;
  }
  for (const [k, def] of Object.entries(SKILLS)) {
    b[k] = def.bool ? (b[k] > 0 ? 1 : 0) : Math.min(def.cap, b[k]);
  }
  return b;
}

function dexEntry(state, sid) {
  if (!state.dex[sid]) state.dex[sid] = { seen: 0, tamed: 0 };
  return state.dex[sid];
}

export function dexSee(state, sid) {
  const e = dexEntry(state, sid);
  if (e.seen) return false;
  e.seen = 1;
  return true;
}

/** 一顆水果能增加多少好感度（0 = 不吃） */
export function feedValue(def, fid) {
  const f = FRUITS[fid];
  if (!f) return 0;
  const { diet } = def;
  if (diet.type === 'only') return diet.foods.includes(fid) ? 1 : 0;
  if (diet.type === 'attr' && f.attr !== def.attr) return 0;
  return fid === diet.fav ? 2 : 1;
}

function tame(state, sid) {
  const c = { uid: `c${state.nextUid++}`, sid, lv: 1, exp: 0, floor: state.floor };
  state.creatures.push(c);
  const toParty = state.party.length < PARTY_MAX;
  if (toParty) state.party.push(c.uid);
  const e = dexEntry(state, sid);
  e.seen = 1;
  e.tamed += 1;
  state.stats.tamed += 1;
  return { creature: c, toParty };
}

export function feedCreature(state, x, y, fid, rng = Math.random) {
  const d = state.dungeon;
  const t = d && tileAt(d, x, y);
  if (!t || !t.ent || t.ent.type !== 'creature') return { ok: false, msg: '這裡沒有生物' };
  if (!invCount(state, fid)) return { ok: false, msg: '你沒有這個水果' };
  const def = CREATURES[t.ent.sid];
  const v = feedValue(def, fid);
  if (v <= 0) {
    return { ok: false, refused: true, msg: `${def.name}聞了聞${FRUITS[fid].name}，把頭撇開了…` };
  }
  addInv(state, fid, -1);
  state.stats.fed += 1;
  let gain = v;
  let bonus = false;
  const b = getBonuses(state);
  if (b.charm > 0 && rng() < b.charm) {
    gain += 1;
    bonus = true;
  }
  t.ent.aff = Math.min(def.need, (t.ent.aff || 0) + gain);
  const res = { ok: true, sid: t.ent.sid, gain, bonus, fav: v >= 2, aff: t.ent.aff, need: def.need };
  if (t.ent.aff >= def.need) {
    const r = tame(state, t.ent.sid);
    t.ent = null;
    const i = state.party.indexOf(r.creature.uid);
    if (i >= 0) {
      // 新夥伴從原本站的位置跟上隊伍
      for (let k = d.trail.length; k < i; k++) d.trail[k] = { x: d.player.x, y: d.player.y };
      d.trail[i] = { x, y };
      d.trail.length = Math.min(d.trail.length, PARTY_MAX);
    }
    Object.assign(res, { tamed: true, creature: r.creature, toParty: r.toParty });
  }
  return res;
}

// ───────────────────────── 地牢 ─────────────────────────

export const pickSize = (rng) => weighted(rng, SIZE_TABLE);

export function tileAt(d, x, y) {
  if (x < 0 || y < 0 || x >= d.size || y >= d.size) return null;
  return d.tiles[y * d.size + x];
}

export const isBlocking = (ent) => !!ent && (ent.type === 'creature' || ent.type === 'merchant');

/** 可以放東西的空格（沒有物件、也不是玩家站的位置；打開過的寶箱可以覆蓋） */
export function isEmptyTile(d, t) {
  if (!t) return false;
  if (t.x === d.player.x && t.y === d.player.y) return false;
  return !t.ent || (t.ent.type === 'chest' && t.ent.opened);
}

function neighbors(d, t) {
  const out = [];
  for (const [dx, dy] of Object.values(DIRS)) {
    const n = tileAt(d, t.x + dx, t.y + dy);
    if (n) out.push(n);
  }
  return out;
}

/** 從 from 出發能不能走到所有「不會擋路」的地塊 */
export function isConnected(d, from) {
  const start = tileAt(d, from.x, from.y);
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const t = queue.shift();
    for (const n of neighbors(d, t)) {
      if (!seen.has(n) && !isBlocking(n.ent)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  let walkable = 0;
  for (const t of d.tiles) if (!isBlocking(t.ent) || t === start) walkable++;
  return seen.size === walkable;
}

export function rollCreature(attr, floor, bonuses, rng) {
  const luck = bonuses.luck || 0;
  const depth = Math.min(floor || 0, 40);
  const w = {
    1: RARITY_WEIGHTS[1],
    2: RARITY_WEIGHTS[2] * (1 + luck * 2) + depth * 0.3,
    3: RARITY_WEIGHTS[3] * (1 + luck * 3) + depth * 0.1,
  };
  const list = Object.entries(CREATURES).filter(([, c]) => c.attr === attr);
  const count = { 1: 0, 2: 0, 3: 0 };
  for (const [, c] of list) count[c.rarity]++;
  return weighted(rng, list.map(([id, c]) => [id, w[c.rarity] / count[c.rarity]]));
}

export function rollFruit(attr, rng) {
  const list = Object.entries(FRUITS).filter(([, f]) => f.attr === attr);
  return weighted(rng, list.map(([id, f]) => [id, f.rare ? 12 : 44]));
}

export function makeMerchant(attr, rng) {
  const ids = Object.keys(FRUITS);
  const ownCommon = ids.filter((id) => FRUITS[id].attr === attr && !FRUITS[id].rare);
  const otherCommon = ids.filter((id) => FRUITS[id].attr !== attr && !FRUITS[id].rare);
  const rares = ids.filter((id) => FRUITS[id].rare);
  const stock = [{ id: pick(rng, ownCommon), qty: 3 }];
  if (rng() < 0.5) stock.push({ id: pick(rng, rares), qty: 2 });
  else stock.push({ id: pick(rng, otherCommon), qty: 3 });
  for (const id of shuffle(rng, Object.keys(ITEMS)).slice(0, 2)) stock.push({ id, qty: randInt(rng, 1, 2) });
  const themed = Object.keys(FURNITURE).filter((id) => FURNITURE[id].attr === attr);
  const generic = Object.keys(FURNITURE).filter((id) => !FURNITURE[id].attr);
  const f1 = rng() < 0.6 ? pick(rng, themed) : pick(rng, generic);
  const f2 = pick(rng, generic.filter((id) => id !== f1));
  stock.push({ id: f1, qty: 1 }, { id: f2, qty: 1 });
  for (const s of stock) s.price = defOf(s.id).def.price;
  return { type: 'merchant', stock };
}

export function generateDungeon({
  floor = 1, bonuses = emptyBonuses(), rng = Math.random, attr = null, size = null, tutorial = false,
} = {}) {
  size = size || (tutorial ? 3 : pickSize(rng));
  attr = attr || pick(rng, ATTR_IDS);
  const d = { floor, attr, size, tiles: [], player: { x: 0, y: 0, dir: 'down' }, trail: [] };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      d.tiles.push({ x, y, deco: rng() < 0.55 ? randInt(rng, 1, 3) : 0, seen: false, ent: null });
    }
  }
  const edge = d.tiles.filter((t) => t.x === 0 || t.y === 0 || t.x === size - 1 || t.y === size - 1);
  const start = pick(rng, edge);
  d.player = { x: start.x, y: start.y, dir: start.y === size - 1 ? 'up' : 'down' };

  const dist = (t) => Math.abs(t.x - start.x) + Math.abs(t.y - start.y);
  const maxD = Math.max(...d.tiles.map(dist));
  const far = d.tiles.filter((t) => dist(t) >= Math.max(1, maxD - (size >= 4 ? 1 : 0)));
  const exitTile = pick(rng, far);
  exitTile.ent = { type: 'exit' };

  const free = shuffle(rng, d.tiles.filter((t) => t !== start && t !== exitTile));
  const take = () => free.shift() || null;
  const placeBlocker = (ent) => {
    for (let i = 0; i < free.length; i++) {
      const t = free[i];
      t.ent = ent;
      if (isConnected(d, start)) {
        free.splice(i, 1);
        return t;
      }
      t.ent = null;
    }
    return null;
  };

  const cfg = SIZE_CONTENT[size];
  if (!tutorial && rng() < cfg.merchant + (bonuses.luck || 0) * 0.25) placeBlocker(makeMerchant(attr, rng));

  const nCreatures = tutorial ? 1 : weighted(rng, cfg.creatures);
  for (let i = 0; i < nCreatures; i++) {
    const sid = tutorial
      ? pick(rng, Object.keys(CREATURES).filter((id) => CREATURES[id].attr === attr && CREATURES[id].rarity === 1))
      : rollCreature(attr, floor, bonuses, rng);
    placeBlocker({ type: 'creature', sid, aff: 0 });
  }

  if (!tutorial && rng() < cfg.hole + (bonuses.moleFriend || 0)) {
    const t = take();
    if (t) t.ent = { type: 'hole' };
  }
  const nChests = tutorial ? 1 : weighted(rng, cfg.chests);
  for (let i = 0; i < nChests; i++) {
    const t = take();
    if (t) t.ent = { type: 'chest', opened: false };
  }
  const nFruits = weighted(rng, cfg.fruits);
  for (let i = 0; i < nFruits; i++) {
    const t = take();
    if (t) t.ent = { type: 'fruit', fid: rollFruit(attr, rng) };
  }
  for (const t of free) if (rng() < cfg.coin) t.ent = { type: 'coin' };

  // 再小的房間也要有一點驚喜
  const interesting = d.tiles.some((t) => t.ent && t.ent.type !== 'exit' && t.ent.type !== 'coin');
  if (!interesting) {
    const cand = d.tiles.filter((t) => t !== start && (!t.ent || t.ent.type === 'coin'));
    if (cand.length) {
      const t = pick(rng, cand);
      t.ent = rng() < 0.5 ? { type: 'chest', opened: false } : { type: 'fruit', fid: rollFruit(attr, rng) };
    }
  }
  return d;
}

/** 揭開玩家視野內的地塊，回傳新看到的地塊 */
export function revealAround(state) {
  const d = state.dungeon;
  if (!d) return [];
  const b = getBonuses(state);
  const r = 1 + (b.vision || 0);
  const newly = [];
  for (const t of d.tiles) {
    if (!t.seen && Math.max(Math.abs(t.x - d.player.x), Math.abs(t.y - d.player.y)) <= r) {
      t.seen = true;
      newly.push(t);
    }
  }
  if (b.exitSense) {
    const ex = d.tiles.find((t) => t.ent && t.ent.type === 'exit');
    if (ex && !ex.seen) {
      ex.seen = true;
      newly.push(ex);
    }
  }
  for (const t of newly) if (t.ent && t.ent.type === 'creature') dexSee(state, t.ent.sid);
  return newly;
}

export function enterNewFloor(state, rng = Math.random, opts = {}) {
  state.floor += 1;
  state.stats.floors = Math.max(state.stats.floors, state.floor);
  state.dungeon = generateDungeon({ floor: state.floor, bonuses: getBonuses(state), rng, ...opts });
  state.scene = 'dungeon';
  revealAround(state);
  return state.dungeon;
}

export function enterNest(state) {
  state.scene = 'nest';
  state.dungeon = null;
  state.stats.nestVisits += 1;
}

export function frontTile(d) {
  const v = DIRS[d.player.dir];
  return tileAt(d, d.player.x + v[0], d.player.y + v[1]);
}

export function rollChestLoot(attr, b, rng) {
  let count = 1 + (rng() < 0.45 ? 1 : 0);
  let bonus = false;
  if (b.treasure > 0 && rng() < b.treasure) {
    count += 1;
    bonus = true;
  }
  const got = new Map();
  for (let i = 0; i < count; i++) {
    const id = weighted(rng, CHEST_LOOT[attr]);
    const n = FRUITS[id] && !FRUITS[id].rare ? randInt(rng, 1, 2) : 1;
    got.set(id, (got.get(id) || 0) + n);
  }
  return { items: [...got].map(([id, n]) => ({ id, n })), bonus };
}

function collectCoin(state, t, b, rng, magnet = false) {
  let n = 1;
  if (b.coinPlus > 0 && rng() < b.coinPlus) n += 1;
  state.coins += n;
  state.stats.coins += n;
  t.ent = null;
  return [{ type: 'coin', x: t.x, y: t.y, n, magnet }];
}

function stepOn(state, t, b, rng) {
  const e = t.ent;
  if (!e) return [];
  switch (e.type) {
    case 'coin':
      return collectCoin(state, t, b, rng);
    case 'fruit': {
      let n = 1;
      if (b.harvest > 0 && rng() < b.harvest) n += 1;
      addInv(state, e.fid, n);
      state.stats.fruits += n;
      t.ent = null;
      return [{ type: 'fruit', x: t.x, y: t.y, id: e.fid, n }];
    }
    case 'chest': {
      if (e.opened) return [];
      const loot = rollChestLoot(state.dungeon.attr, b, rng);
      for (const l of loot.items) addInv(state, l.id, l.n);
      e.opened = true;
      state.stats.chests += 1;
      return [{ type: 'chest', x: t.x, y: t.y, loot: loot.items, bonus: loot.bonus }];
    }
    case 'hole':
      return [{ type: 'hole', x: t.x, y: t.y }];
    case 'exit':
      return [{ type: 'exit', x: t.x, y: t.y }];
    default:
      return [];
  }
}

/**
 * 嘗試往某個方向走一格。
 * 撞到生物/商人＝互動（不耗步數）；撞牆＝轉身；走進空地＝消耗 1 步。
 */
export function tryMove(state, dir, rng = Math.random) {
  const d = state.dungeon;
  const vec = DIRS[dir];
  if (!d || state.scene !== 'dungeon' || !vec) return { moved: false, events: [] };
  const p = d.player;
  p.dir = dir;
  const t = tileAt(d, p.x + vec[0], p.y + vec[1]);
  if (!t) return { moved: false, events: [{ type: 'wall' }] };
  if (t.ent && t.ent.type === 'creature') {
    t.seen = true;
    dexSee(state, t.ent.sid);
    return { moved: false, events: [{ type: 'creature', x: t.x, y: t.y }] };
  }
  if (t.ent && t.ent.type === 'merchant') {
    t.seen = true;
    return { moved: false, events: [{ type: 'merchant', x: t.x, y: t.y }] };
  }
  if (state.steps <= 0) return { moved: false, events: [{ type: 'no-steps' }] };

  const b = getBonuses(state);
  const saved = b.stepSave > 0 && rng() < b.stepSave;
  if (!saved) state.steps -= 1;
  d.trail.unshift({ x: p.x, y: p.y });
  if (d.trail.length > PARTY_MAX) d.trail.length = PARTY_MAX;
  p.x = t.x;
  p.y = t.y;
  state.stats.moves += 1;
  const events = [{ type: 'move', x: t.x, y: t.y, saved }];

  for (const uid of state.party) {
    const c = findCreature(state, uid);
    if (!c) continue;
    const before = c.lv;
    c.exp += 1;
    c.lv = levelForExp(c.exp);
    if (c.lv > before) {
      const skills = CREATURES[c.sid].skills.filter((s) => s.lv > before && s.lv <= c.lv);
      events.push({ type: 'level', uid, lv: c.lv, skills });
    }
  }

  events.push(...stepOn(state, t, b, rng));
  if (b.magnet) {
    for (const n of neighbors(d, t)) {
      if (n.ent && n.ent.type === 'coin') events.push(...collectCoin(state, n, b, rng, true));
    }
  }
  revealAround(state);
  return { moved: true, events };
}

// ───────────────────────── 商人 ─────────────────────────

export function priceOf(state, s) {
  return Math.max(1, Math.round(s.price * (1 - getBonuses(state).bargain)));
}

export function buy(state, x, y, index) {
  const t = state.dungeon && tileAt(state.dungeon, x, y);
  if (!t || !t.ent || t.ent.type !== 'merchant') return { ok: false, msg: '商人不在這裡' };
  const s = t.ent.stock[index];
  if (!s || s.qty <= 0) return { ok: false, msg: '這個已經賣完了' };
  const price = priceOf(state, s);
  if (state.coins < price) return { ok: false, msg: `錢幣不夠，需要 ${price} 枚` };
  state.coins -= price;
  s.qty -= 1;
  addInv(state, s.id, 1);
  state.stats.spent += price;
  return { ok: true, id: s.id, price };
}

// ───────────────────────── 道具 ─────────────────────────

function faceToward(d, t) {
  const dx = t.x - d.player.x;
  const dy = t.y - d.player.y;
  for (const [k, v] of Object.entries(DIRS)) if (v[0] === dx && v[1] === dy) d.player.dir = k;
}

/** 面前優先，再來右手邊、左手邊、背後 */
function adjacentByPreference(d) {
  const order = ['up', 'right', 'down', 'left'];
  const i = order.indexOf(d.player.dir);
  return [0, 1, 3, 2]
    .map((k) => order[(i + k) % 4])
    .map((dir) => tileAt(d, d.player.x + DIRS[dir][0], d.player.y + DIRS[dir][1]))
    .filter(Boolean);
}

/** 把會擋路的東西（生物、商人）放在離玩家最近、又不會把路堵死的空格 */
function placeBlockerNear(d, ent) {
  const adjacent = adjacentByPreference(d);
  const dist = (t) => Math.abs(t.x - d.player.x) + Math.abs(t.y - d.player.y);
  const rest = d.tiles.filter((t) => !adjacent.includes(t)).sort((a, b) => dist(a) - dist(b));
  for (const t of [...adjacent, ...rest]) {
    if (!isEmptyTile(d, t)) continue;
    const prev = t.ent;
    t.ent = ent;
    if (isConnected(d, d.player)) return t;
    t.ent = prev;
  }
  return null;
}

export function canUseItem(state, id) {
  return !!ITEMS[id] && state.scene === 'dungeon' && !!state.dungeon;
}

export function useItem(state, id, rng = Math.random) {
  if (!ITEMS[id]) return { ok: false, msg: '這個東西不能使用' };
  if (!invCount(state, id)) return { ok: false, msg: '你沒有這個道具' };
  if (state.scene !== 'dungeon' || !state.dungeon) return { ok: false, msg: '只能在地牢裡使用' };
  const d = state.dungeon;
  const events = [];
  switch (id) {
    case 'mole_snack': {
      const t = adjacentByPreference(d).find((n) => isEmptyTile(d, n));
      if (!t) return { ok: false, msg: '四周沒有空格可以挖洞' };
      t.ent = { type: 'hole' };
      t.seen = true;
      faceToward(d, t);
      events.push({ type: 'hole-dug', x: t.x, y: t.y });
      break;
    }
    case 'lure_dango': {
      const sid = rollCreature(d.attr, state.floor, getBonuses(state), rng);
      const t = placeBlockerNear(d, { type: 'creature', sid, aff: 0 });
      if (!t) return { ok: false, msg: '這層已經沒有空位，生物過不來' };
      t.seen = true;
      dexSee(state, sid);
      events.push({ type: 'creature-arrive', x: t.x, y: t.y, sid });
      break;
    }
    case 'lucky_candy': {
      const spots = shuffle(rng, d.tiles.filter((t) => isEmptyTile(d, t))).slice(0, 3);
      if (!spots.length) return { ok: false, msg: '地上已經沒有空位了' };
      for (const t of spots) {
        t.ent = { type: 'coin' };
        t.seen = true;
      }
      events.push({ type: 'coins-appear', tiles: spots.map((t) => ({ x: t.x, y: t.y })) });
      break;
    }
    case 'compass': {
      const ex = d.tiles.find((t) => t.ent && t.ent.type === 'exit');
      if (!ex || ex.seen) return { ok: false, msg: '出口已經找到了，不需要指南針' };
      ex.seen = true;
      events.push({ type: 'reveal-exit', x: ex.x, y: ex.y });
      break;
    }
    case 'lantern': {
      const dark = d.tiles.filter((t) => !t.seen);
      if (!dark.length) return { ok: false, msg: '這層已經全部看清楚了' };
      for (const t of dark) {
        t.seen = true;
        if (t.ent && t.ent.type === 'creature') dexSee(state, t.ent.sid);
      }
      events.push({ type: 'reveal-all' });
      break;
    }
    case 'horn': {
      if (d.tiles.some((t) => t.ent && t.ent.type === 'merchant')) return { ok: false, msg: '商人已經在這層了' };
      const t = placeBlockerNear(d, makeMerchant(d.attr, rng));
      if (!t) return { ok: false, msg: '這層已經沒有空位，商人過不來' };
      t.seen = true;
      events.push({ type: 'merchant-arrive', x: t.x, y: t.y });
      break;
    }
    default:
      return { ok: false, msg: '這個東西不能使用' };
  }
  addInv(state, id, -1);
  state.stats.itemsUsed += 1;
  return { ok: true, events };
}

// ───────────────────────── 地底小窩 ─────────────────────────

export function nestFixedAt(x, y) {
  for (const [k, p] of Object.entries(NEST_FIXED)) if (p.x === x && p.y === y) return k;
  return null;
}

export const nestItemAt = (state, x, y) => state.nest.placed.find((p) => p.x === x && p.y === y) || null;

export function placeFurniture(state, id, x, y) {
  if (!FURNITURE[id]) return { ok: false, msg: '這不是家具' };
  if (!invCount(state, id)) return { ok: false, msg: '沒有這個家具了' };
  if (x < 0 || y < 0 || x >= NEST_W || y >= NEST_H) return { ok: false, msg: '超出小窩範圍' };
  if (nestFixedAt(x, y)) return { ok: false, msg: '這格不能放家具' };
  if (nestItemAt(state, x, y)) return { ok: false, msg: '這格已經放了東西' };
  addInv(state, id, -1);
  state.nest.placed.push({ id, x, y });
  return { ok: true };
}

export function pickupFurniture(state, x, y) {
  const i = state.nest.placed.findIndex((p) => p.x === x && p.y === y);
  if (i < 0) return { ok: false, msg: '這格沒有家具' };
  const [p] = state.nest.placed.splice(i, 1);
  addInv(state, p.id, 1);
  return { ok: true, id: p.id };
}

/** 搖鈴區：把生物加入或移出隊伍（只能在小窩進行） */
export function toggleParty(state, uid) {
  if (state.scene !== 'nest') return { ok: false, msg: '要回到地底小窩的搖鈴區才能更換隊伍' };
  if (!findCreature(state, uid)) return { ok: false, msg: '找不到這隻生物' };
  const i = state.party.indexOf(uid);
  if (i >= 0) {
    state.party.splice(i, 1);
    return { ok: true, joined: false };
  }
  if (state.party.length >= PARTY_MAX) return { ok: false, msg: `隊伍最多只能帶 ${PARTY_MAX} 隻` };
  state.party.push(uid);
  return { ok: true, joined: true };
}
