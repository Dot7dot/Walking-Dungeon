import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/rng.js';
import {
  CREATURES, FRUITS, FURNITURE, ITEMS, PARTY_MAX, STEP_UNITS, NEST_FIXED, START_STEPS, START_COINS, START_FRUITS,
} from '../js/data.js';
import {
  generateDungeon, pickSize, isConnected, isBlocking, tileAt, tryMove, addUnits, manualSync,
  feedCreature, feedValue, getBonuses, levelForExp, useItem, buy, priceOf, enterNewFloor, enterNest,
  toggleParty, placeFurniture, pickupFurniture, revealAround, frontTile, makeMerchant,
} from '../js/logic.js';
import { defaultState, exportSave, importSave, normalize } from '../js/store.js';

/** 做一個可控制內容的小地牢 */
function fixture(size = 3, attr = 'forest') {
  const state = defaultState();
  state.started = true;
  state.floor = 1;
  state.coins = 0;
  const d = { floor: 1, attr, size, tiles: [], player: { x: 0, y: 0, dir: 'right' }, trail: [] };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) d.tiles.push({ x, y, deco: 0, seen: true, ent: null });
  d.tiles[size * size - 1].ent = { type: 'exit' };
  state.dungeon = d;
  state.scene = 'dungeon';
  return state;
}

test('開局見面禮：100 步、100 元、每種水果各 10 個', () => {
  assert.equal(START_STEPS, 100);
  assert.equal(START_COINS, 100);
  assert.equal(START_FRUITS, 10);
  const s = defaultState();
  assert.equal(s.steps, 100);
  assert.equal(s.coins, 100);
  for (const id of Object.keys(FRUITS)) assert.equal(s.inv[id], 10, `${id} ×10`);
  assert.equal(s.inv.mole_snack, 1);
  // 每次開新遊戲都是新的物件，不會互相影響
  s.inv.apple = 0;
  assert.equal(defaultState().inv.apple, 10);
});

test('地牢大小比例：2×2 與 5×5 各約 10%', () => {
  const rng = mulberry32(42);
  const count = { 2: 0, 3: 0, 4: 0, 5: 0 };
  const N = 20000;
  for (let i = 0; i < N; i++) count[pickSize(rng)]++;
  assert.ok(Math.abs(count[2] / N - 0.1) < 0.012, `2×2 = ${count[2] / N}`);
  assert.ok(Math.abs(count[5] / N - 0.1) < 0.012, `5×5 = ${count[5] / N}`);
  assert.ok(Math.abs(count[3] / N - 0.4) < 0.02);
  assert.ok(Math.abs(count[4] / N - 0.4) < 0.02);
});

test('生成的地牢：大小正確、一個出口、所有可走地塊都連通', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 3000; i++) {
    const d = generateDungeon({ floor: 1 + (i % 30), rng });
    assert.ok(d.size >= 2 && d.size <= 5);
    assert.equal(d.tiles.length, d.size * d.size);
    assert.ok(['sand', 'forest', 'swamp'].includes(d.attr));
    const exits = d.tiles.filter((t) => t.ent && t.ent.type === 'exit');
    assert.equal(exits.length, 1);
    const start = tileAt(d, d.player.x, d.player.y);
    assert.equal(start.ent, null, '起點是空的');
    assert.ok(isConnected(d, d.player), '所有地塊都走得到');
    assert.ok(d.tiles.filter((t) => t.ent && t.ent.type === 'merchant').length <= 1);
    for (const t of d.tiles) {
      if (t.ent && t.ent.type === 'creature') {
        assert.equal(CREATURES[t.ent.sid].attr, d.attr, '生物屬性與地牢一致');
      }
      if (t.ent && t.ent.type === 'fruit') assert.equal(FRUITS[t.ent.fid].attr, d.attr, '水果屬性與地牢一致');
    }
    const interesting = d.tiles.some((t) => t.ent && !['exit', 'coin'].includes(t.ent.type));
    assert.ok(interesting, '每層都有寶箱／水果／生物等內容');
  }
});

test('新手第一層：3×3、有一隻普通生物和一個寶箱', () => {
  const s = defaultState();
  enterNewFloor(s, mulberry32(1), { tutorial: true });
  const d = s.dungeon;
  assert.equal(s.floor, 1);
  assert.equal(d.size, 3);
  const cre = d.tiles.filter((t) => t.ent && t.ent.type === 'creature');
  assert.equal(cre.length, 1);
  assert.equal(CREATURES[cre[0].ent.sid].rarity, 1);
  assert.equal(d.tiles.filter((t) => t.ent && t.ent.type === 'chest').length, 1);
  assert.ok(tileAt(d, d.player.x, d.player.y).seen);
});

test('每 50 公尺（單位）換 1 步，餘數保留', () => {
  const s = defaultState();
  const before = s.steps;
  assert.equal(addUnits(s, 30, '2026-01-01'), 0);
  assert.equal(addUnits(s, 30, '2026-01-01'), 1);
  assert.equal(s.steps, before + 1);
  assert.ok(Math.abs(s.progress - 10) < 1e-9);
  assert.equal(addUnits(s, 140, '2026-01-01'), 3);
  assert.equal(s.steps, before + 4);
  assert.equal(addUnits(s, -5), 0);
  assert.equal(addUnits(s, NaN), 0);
  assert.equal(s.daily.units, 200);
  assert.equal(STEP_UNITS, 50);
});

test('手動同步只補上今天尚未計算的距離', () => {
  const s = defaultState();
  addUnits(s, 500, '2026-05-01'); // GPS 已經算了 500 m
  const r = manualSync(s, 2000, '2026-05-01');
  assert.ok(r.ok);
  assert.equal(r.credit, 1500);
  assert.equal(r.gained, 30);
  const again = manualSync(s, 1800, '2026-05-01');
  assert.equal(again.ok, false, '數值變小不能同步');
  const nextDay = manualSync(s, 1000, '2026-05-02');
  assert.ok(nextDay.ok, '隔天重新計算');
  assert.equal(nextDay.credit, 1000);
  assert.equal(manualSync(s, 0).ok, false);
});

test('移動：消耗步數、撿錢幣、步數不足時無法移動', () => {
  const s = fixture();
  s.steps = 1;
  tileAt(s.dungeon, 1, 0).ent = { type: 'coin' };
  const r = tryMove(s, 'right', () => 0.99);
  assert.ok(r.moved);
  assert.equal(s.steps, 0);
  assert.equal(s.coins, 1);
  assert.equal(tileAt(s.dungeon, 1, 0).ent, null);
  const r2 = tryMove(s, 'right', () => 0.99);
  assert.equal(r2.moved, false);
  assert.equal(r2.events[0].type, 'no-steps');
  // 撞牆只轉向、不耗步數
  s.steps = 3;
  const r3 = tryMove(s, 'up', () => 0.99);
  assert.equal(r3.moved, false);
  assert.equal(r3.events[0].type, 'wall');
  assert.equal(s.dungeon.player.dir, 'up');
  assert.equal(s.steps, 3);
});

test('撞到生物或商人是互動，不會走過去也不耗步數', () => {
  const s = fixture();
  s.steps = 5;
  tileAt(s.dungeon, 1, 0).ent = { type: 'creature', sid: 'squirrel', aff: 0 };
  tileAt(s.dungeon, 0, 1).ent = makeMerchant('forest', mulberry32(3));
  const r = tryMove(s, 'right');
  assert.equal(r.moved, false);
  assert.equal(r.events[0].type, 'creature');
  assert.equal(s.steps, 5);
  assert.ok(s.dex.squirrel.seen);
  const m = tryMove(s, 'down');
  assert.equal(m.events[0].type, 'merchant');
  assert.equal(s.steps, 5);
});

test('寶箱、水果、出口與鼴鼠洞', () => {
  const s = fixture(3, 'sand');
  s.steps = 10;
  tileAt(s.dungeon, 1, 0).ent = { type: 'chest', opened: false };
  tileAt(s.dungeon, 2, 0).ent = { type: 'fruit', fid: 'melon' };
  tileAt(s.dungeon, 2, 1).ent = { type: 'hole' };
  const before = { ...s.inv };
  const r = tryMove(s, 'right', mulberry32(5));
  const chest = r.events.find((e) => e.type === 'chest');
  assert.ok(chest && chest.loot.length >= 1);
  for (const l of chest.loot) {
    assert.ok(FRUITS[l.id] || ITEMS[l.id], '寶箱裡只有水果、零食或道具');
    assert.equal(s.inv[l.id], (before[l.id] || 0) + l.n);
  }
  assert.ok(tileAt(s.dungeon, 1, 0).ent.opened);
  const melons = s.inv.melon || 0;
  const r2 = tryMove(s, 'right', () => 0.99);
  assert.ok(r2.events.some((e) => e.type === 'fruit' && e.id === 'melon'));
  assert.equal(s.inv.melon, melons + 1);
  const r3 = tryMove(s, 'down', () => 0.99);
  assert.ok(r3.events.some((e) => e.type === 'hole'));
  const r4 = tryMove(s, 'down', () => 0.99);
  assert.ok(r4.events.some((e) => e.type === 'exit'));
});

test('餵食：普通生物什麼都吃、最愛的水果 +2，好感度滿了就加入隊伍', () => {
  const s = fixture();
  tileAt(s.dungeon, 1, 0).ent = { type: 'creature', sid: 'squirrel', aff: 0 };
  s.inv = { apple: 1, melon: 2 };
  let r = feedCreature(s, 1, 0, 'melon', () => 0.99);
  assert.ok(r.ok);
  assert.equal(r.aff, 1);
  r = feedCreature(s, 1, 0, 'apple', () => 0.99);
  assert.equal(r.aff, 3);
  assert.ok(r.tamed);
  assert.ok(r.toParty);
  assert.equal(s.party.length, 1);
  assert.equal(s.creatures[0].sid, 'squirrel');
  assert.equal(tileAt(s.dungeon, 1, 0).ent, null);
  assert.equal(s.dex.squirrel.tamed, 1);
  assert.deepEqual(s.dungeon.trail[0], { x: 1, y: 0 }, '新夥伴從原本的位置跟上');
});

test('稀有生物只吃自己屬性的水果，傳說生物只吃指定水果', () => {
  assert.equal(feedValue(CREATURES.owl, 'melon'), 0);
  assert.equal(feedValue(CREATURES.owl, 'apple'), 1);
  assert.equal(feedValue(CREATURES.owl, 'starpeach'), 2);
  assert.equal(feedValue(CREATURES.unicorn, 'apple'), 0);
  assert.equal(feedValue(CREATURES.unicorn, 'starpeach'), 1);
  assert.equal(feedValue(CREATURES.lizard, 'grape'), 1);
  const s = fixture();
  tileAt(s.dungeon, 1, 0).ent = { type: 'creature', sid: 'unicorn', aff: 0 };
  s.inv = { apple: 3 };
  const r = feedCreature(s, 1, 0, 'apple');
  assert.equal(r.ok, false);
  assert.ok(r.refused);
  assert.equal(s.inv.apple, 3, '不吃的水果不會被消耗');
  assert.ok(CREATURES.unicorn.need > CREATURES.squirrel.need);
});

test('隊伍滿了，新收服的生物會送回地底小窩', () => {
  const s = fixture();
  s.creatures = [
    { uid: 'c1', sid: 'frog', lv: 1, exp: 0 },
    { uid: 'c2', sid: 'snail', lv: 1, exp: 0 },
    { uid: 'c3', sid: 'hedgehog', lv: 1, exp: 0 },
  ];
  s.party = ['c1', 'c2', 'c3'];
  s.nextUid = 4;
  tileAt(s.dungeon, 1, 0).ent = { type: 'creature', sid: 'snail', aff: 1 };
  s.inv = { grape: 1 };
  const r = feedCreature(s, 1, 0, 'grape', () => 0.99);
  assert.ok(r.tamed);
  assert.equal(r.toParty, false);
  assert.equal(s.party.length, PARTY_MAX);
  assert.equal(s.creatures.length, 4);
});

test('跟著走會累積經驗升級並解鎖新能力', () => {
  assert.equal(levelForExp(0), 1);
  assert.equal(levelForExp(15), 2);
  assert.equal(levelForExp(40), 3);
  assert.equal(levelForExp(1000), 5);
  const s = fixture(5);
  s.creatures = [{ uid: 'c1', sid: 'hedgehog', lv: 2, exp: 39 }];
  s.party = ['c1'];
  s.steps = 5;
  const r = tryMove(s, 'right', () => 0.99);
  const lv = r.events.find((e) => e.type === 'level');
  assert.ok(lv);
  assert.equal(lv.lv, 3);
  assert.ok(lv.skills.some((k) => k.type === 'stepSave'));
  const b = getBonuses(s);
  assert.ok(b.coinPlus > 0 && b.stepSave > 0);
});

test('能力加成有上限，省步可以免費移動', () => {
  const s = fixture(4);
  s.creatures = [
    { uid: 'a', sid: 'deer', lv: 5, exp: 999 },
    { uid: 'b', sid: 'deer', lv: 5, exp: 999 },
    { uid: 'c', sid: 'deer', lv: 5, exp: 999 },
  ];
  s.party = ['a', 'b', 'c'];
  const b = getBonuses(s);
  assert.equal(b.stepSave, 0.5);
  s.steps = 1;
  const r = tryMove(s, 'right', () => 0.0);
  assert.ok(r.moved);
  assert.ok(r.events[0].saved);
  assert.equal(s.steps, 1);
});

test('視野與出口感應', () => {
  const s = fixture(5);
  for (const t of s.dungeon.tiles) t.seen = false;
  revealAround(s);
  assert.equal(s.dungeon.tiles.filter((t) => t.seen).length, 4, '角落視野 2×2');
  assert.equal(tileAt(s.dungeon, 4, 4).seen, false);
  s.creatures = [{ uid: 'o', sid: 'owl', lv: 3, exp: 40 }];
  s.party = ['o'];
  revealAround(s);
  assert.ok(tileAt(s.dungeon, 2, 2).seen, '貓頭鷹讓視野 +1');
  assert.ok(tileAt(s.dungeon, 4, 4).seen, 'Lv3 貓頭鷹感應到出口');
});

test('鼴鼠零食：在面前的空格挖出鼴鼠洞', () => {
  const s = fixture();
  s.inv = { mole_snack: 2 };
  s.dungeon.player = { x: 1, y: 1, dir: 'up' };
  const r = useItem(s, 'mole_snack');
  assert.ok(r.ok);
  assert.equal(tileAt(s.dungeon, 1, 0).ent.type, 'hole');
  assert.equal(s.inv.mole_snack, 1);
  // 面前被擋住時改挖旁邊的空格，並轉向那裡
  tileAt(s.dungeon, 2, 1).ent = { type: 'coin' };
  s.dungeon.player.dir = 'up';
  const r2 = useItem(s, 'mole_snack');
  assert.ok(r2.ok);
  const dug = r2.events[0];
  assert.equal(tileAt(s.dungeon, dug.x, dug.y).ent.type, 'hole');
  assert.deepEqual(tileAt(s.dungeon, dug.x, dug.y), frontTile(s.dungeon));
  assert.equal(s.inv.mole_snack, undefined);
});

test('鼴鼠零食：四周都沒有空格時不會被消耗', () => {
  const s = fixture(2);
  s.inv = { mole_snack: 1 };
  s.dungeon.player = { x: 0, y: 0, dir: 'right' };
  tileAt(s.dungeon, 1, 0).ent = { type: 'coin' };
  tileAt(s.dungeon, 0, 1).ent = { type: 'fruit', fid: 'apple' };
  const r = useItem(s, 'mole_snack');
  assert.equal(r.ok, false);
  assert.equal(s.inv.mole_snack, 1);
});

test('其他道具：提燈、指南針、招財糖、誘餌、號角', () => {
  const s = fixture(4);
  for (const t of s.dungeon.tiles) t.seen = false;
  s.inv = { compass: 1, lantern: 1, lucky_candy: 1, lure_dango: 1, horn: 1 };
  assert.ok(useItem(s, 'compass').ok);
  assert.ok(tileAt(s.dungeon, 3, 3).seen);
  assert.equal(useItem(s, 'compass').ok, false, '用完就沒了');
  assert.ok(useItem(s, 'lantern').ok);
  assert.ok(s.dungeon.tiles.every((t) => t.seen));
  assert.ok(useItem(s, 'lucky_candy', mulberry32(2)).ok);
  assert.equal(s.dungeon.tiles.filter((t) => t.ent && t.ent.type === 'coin').length, 3);
  const lure = useItem(s, 'lure_dango', mulberry32(9));
  assert.ok(lure.ok);
  assert.ok(isConnected(s.dungeon, s.dungeon.player));
  const horn = useItem(s, 'horn', mulberry32(9));
  assert.ok(horn.ok);
  assert.ok(s.dungeon.tiles.some((t) => t.ent && t.ent.type === 'merchant'));
  assert.ok(isConnected(s.dungeon, s.dungeon.player));
});

test('商人：販售水果、道具、家具，殺價能力有效', () => {
  const m = makeMerchant('swamp', mulberry32(11));
  const kinds = m.stock.map((s) => (FRUITS[s.id] ? 'fruit' : ITEMS[s.id] ? 'item' : FURNITURE[s.id] ? 'furn' : '?'));
  assert.ok(kinds.includes('fruit') && kinds.includes('item') && kinds.includes('furn'));
  const s = fixture();
  tileAt(s.dungeon, 1, 0).ent = m;
  s.coins = 0;
  assert.equal(buy(s, 1, 0, 0).ok, false);
  s.coins = 100;
  const price = priceOf(s, m.stock[0]);
  const r = buy(s, 1, 0, 0);
  assert.ok(r.ok);
  assert.equal(s.coins, 100 - price);
  assert.equal(s.inv[m.stock[0].id] >= 1, true);
  s.creatures = [{ uid: 'k', sid: 'snail', lv: 3, exp: 40 }];
  s.party = ['k'];
  assert.ok(priceOf(s, { price: 100 }) < 100);
});

test('地底小窩：佈置家具、搖鈴更換隊伍', () => {
  const s = fixture();
  s.creatures = [
    { uid: 'a', sid: 'frog', lv: 1, exp: 0 },
    { uid: 'b', sid: 'owl', lv: 1, exp: 0 },
    { uid: 'c', sid: 'camel', lv: 1, exp: 0 },
    { uid: 'd', sid: 'lizard', lv: 1, exp: 0 },
  ];
  s.party = ['a'];
  assert.equal(toggleParty(s, 'b').ok, false, '地牢裡不能換隊伍');
  enterNest(s);
  assert.equal(s.scene, 'nest');
  assert.equal(s.dungeon, null);
  assert.ok(toggleParty(s, 'b').ok);
  assert.ok(toggleParty(s, 'c').ok);
  assert.equal(toggleParty(s, 'd').ok, false, '隊伍最多三隻');
  assert.ok(toggleParty(s, 'a').ok);
  assert.deepEqual(s.party, ['b', 'c']);
  s.inv = { plant: 1 };
  assert.equal(placeFurniture(s, 'plant', NEST_FIXED.bell.x, NEST_FIXED.bell.y).ok, false);
  assert.ok(placeFurniture(s, 'plant', 2, 2).ok);
  assert.equal(s.inv.plant, undefined);
  assert.equal(placeFurniture(s, 'plant', 3, 3).ok, false);
  assert.ok(pickupFurniture(s, 2, 2).ok);
  assert.equal(s.inv.plant, 1);
  enterNewFloor(s, mulberry32(4));
  assert.equal(s.scene, 'dungeon');
  assert.equal(s.floor, 2);
});

test('存檔匯出／匯入與舊存檔補齊', () => {
  const s = defaultState();
  s.coins = 77;
  s.inv.apple = 9;
  const code = exportSave(s);
  const back = importSave(code);
  assert.equal(back.coins, 77);
  assert.equal(back.inv.apple, 9);
  assert.equal(importSave('garbage'), null);
  const old = normalize({ coins: 3, stats: { moves: 2 } });
  assert.equal(old.coins, 3);
  assert.equal(old.stats.moves, 2);
  assert.equal(old.stats.tamed, 0);
  assert.ok(Array.isArray(old.nest.placed));
});

test('任何時候都不會把玩家困住（大量隨機遊玩）', () => {
  const rng = mulberry32(2024);
  const s = defaultState();
  s.steps = 100000;
  s.coins = 1000;
  enterNewFloor(s, rng, { tutorial: true });
  const dirs = ['up', 'down', 'left', 'right'];
  for (let i = 0; i < 20000; i++) {
    const r = tryMove(s, dirs[Math.floor(rng() * 4)], rng);
    for (const e of r.events) {
      if (e.type === 'exit' || e.type === 'hole') enterNewFloor(s, rng);
      if (e.type === 'creature') {
        const fid = Object.keys(FRUITS)[Math.floor(rng() * 9)];
        s.inv[fid] = (s.inv[fid] || 0) + 1;
        feedCreature(s, e.x, e.y, fid, rng);
      }
    }
    if (rng() < 0.02) {
      const id = Object.keys(ITEMS)[Math.floor(rng() * 6)];
      s.inv[id] = 1;
      useItem(s, id, rng);
    }
    assert.ok(isConnected(s.dungeon, s.dungeon.player));
    assert.ok(!isBlocking(tileAt(s.dungeon, s.dungeon.player.x, s.dungeon.player.y).ent));
  }
  assert.ok(s.floor > 10);
});
