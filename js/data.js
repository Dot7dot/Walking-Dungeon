// 遊戲靜態資料：屬性、水果、道具、家具、生物、能力
// 這個檔案不碰 DOM，Node 測試也能直接 import。

/** 每 50 公尺（或搖晃 50 次）= 1 步 */
export const STEP_UNITS = 50;
/** 新玩家的見面禮 */
export const START_STEPS = 10;
/** 隊伍上限（跟在玩家後面的生物數） */
export const PARTY_MAX = 3;
/** 等級門檻：LEVEL_EXP[lv] = 升到該等級需要一起走過的步數 */
export const LEVEL_EXP = [0, 0, 15, 40, 80, 150];
export const MAX_LEVEL = 5;

/** 地牢大小：2×2 與 5×5 各 10%，其餘平分 */
export const SIZE_TABLE = [
  [2, 10],
  [3, 40],
  [4, 40],
  [5, 10],
];

export const ATTRS = {
  sand: { id: 'sand', name: '沙土', dungeon: '沙土地牢', chest: '沙岩寶箱' },
  forest: { id: 'forest', name: '森林', dungeon: '森林地牢', chest: '樹根寶箱' },
  swamp: { id: 'swamp', name: '沼澤', dungeon: '沼澤地牢', chest: '苔蘚寶箱' },
};
export const ATTR_IDS = Object.keys(ATTRS);

export const FRUITS = {
  melon: { name: '沙地西瓜', emoji: '🍉', attr: 'sand', rare: false, price: 4, desc: '在乾熱沙地裡長大的西瓜，又甜又多汁。' },
  sunorange: { name: '太陽橘', emoji: '🍊', attr: 'sand', rare: false, price: 4, desc: '吸飽陽光的橘子，摸起來暖暖的。' },
  goldmango: { name: '黃金芒果', emoji: '🥭', attr: 'sand', rare: true, price: 15, desc: '沙丘深處才找得到的稀有芒果，閃著金光。' },
  apple: { name: '森林蘋果', emoji: '🍎', attr: 'forest', rare: false, price: 4, desc: '林間小樹上結的紅蘋果，咬下去脆脆的。' },
  strawberry: { name: '野草莓', emoji: '🍓', attr: 'forest', rare: false, price: 4, desc: '藏在草叢裡的小草莓，酸酸甜甜。' },
  starpeach: { name: '星光桃', emoji: '🍑', attr: 'forest', rare: true, price: 15, desc: '只在星光照得到的樹上結果，非常稀有。' },
  bogberry: { name: '沼澤莓', emoji: '🫐', attr: 'swamp', rare: false, price: 4, desc: '長在濕地邊的藍色小莓果。' },
  grape: { name: '濕地葡萄', emoji: '🍇', attr: 'swamp', rare: false, price: 4, desc: '攀在枯木上的野葡萄，一串好多顆。' },
  fireberry: { name: '螢火櫻桃', emoji: '🍒', attr: 'swamp', rare: true, price: 15, desc: '夜裡會微微發光的櫻桃，沼澤生物的最愛。' },
};

/** 零食（snack）與道具（tool） */
export const ITEMS = {
  mole_snack: { name: '鼴鼠零食', emoji: '🍪', kind: 'snack', price: 10, desc: '使用後，鼴鼠會在你面前的空格挖出一個鼴鼠洞。' },
  lure_dango: { name: '誘餌糰子', emoji: '🍡', kind: 'snack', price: 12, desc: '香甜的氣味會吸引一隻這層的地牢生物來到你身邊。' },
  lucky_candy: { name: '招財糖', emoji: '🍬', kind: 'snack', price: 8, desc: '吃下去之後，地上會冒出 3 枚錢幣。' },
  compass: { name: '指南針', emoji: '🧭', kind: 'tool', price: 6, desc: '指出這層地牢的出口位置。' },
  lantern: { name: '提燈', emoji: '🏮', kind: 'tool', price: 9, desc: '照亮整層地牢，看清所有地塊。' },
  horn: { name: '商人號角', emoji: '📯', kind: 'tool', price: 15, desc: '吹響號角，移動商人會來到你身邊。' },
};

export const FURNITURE = {
  plant: { name: '盆栽', emoji: '🪴', price: 15 },
  chair: { name: '木椅', emoji: '🪑', price: 12 },
  sofa: { name: '沙發', emoji: '🛋️', price: 35 },
  bed: { name: '小床', emoji: '🛏️', price: 30 },
  candle: { name: '燭台', emoji: '🕯️', price: 10 },
  picture: { name: '掛畫', emoji: '🖼️', price: 20 },
  teddy: { name: '熊熊玩偶', emoji: '🧸', price: 18 },
  books: { name: '書堆', emoji: '📚', price: 14 },
  clock: { name: '座鐘', emoji: '🕰️', price: 25 },
  basket: { name: '野餐籃', emoji: '🧺', price: 12 },
  mirror: { name: '鏡子', emoji: '🪞', price: 22 },
  radio: { name: '收音機', emoji: '📻', price: 24 },
  vase: { name: '陶甕', emoji: '🏺', price: 18, attr: 'sand' },
  moai: { name: '石像', emoji: '🗿', price: 40, attr: 'sand' },
  cactus: { name: '仙人掌', emoji: '🌵', price: 12, attr: 'sand' },
  mushroom: { name: '蘑菇燈', emoji: '🍄', price: 16, attr: 'forest' },
  sunflower: { name: '向日葵', emoji: '🌻', price: 12, attr: 'forest' },
  stump: { name: '樹樁凳', emoji: '🪵', price: 14, attr: 'forest' },
  shell: { name: '貝殼', emoji: '🐚', price: 12, attr: 'swamp' },
  chime: { name: '風鈴', emoji: '🎐', price: 16, attr: 'swamp' },
  fountain: { name: '噴泉', emoji: '⛲', price: 45, attr: 'swamp' },
};

const pct = (v) => `${Math.round(v * 100)}%`;

/** 能力：數值型會加總並受上限限制；bool 型只要有就生效 */
export const SKILLS = {
  stepSave: { name: '省步', icon: '👟', cap: 0.5, text: (v) => `移動時有 ${pct(v)} 機率不消耗步數` },
  coinPlus: { name: '招財', icon: '💰', cap: 1, text: (v) => `撿錢幣時有 ${pct(v)} 機率多得 1 枚` },
  vision: { name: '夜視', icon: '👁️', cap: 2, text: (v) => `視野範圍 +${v} 格` },
  harvest: { name: '採集', icon: '🧺', cap: 1, text: (v) => `採水果時有 ${pct(v)} 機率多採 1 顆` },
  treasure: { name: '尋寶', icon: '💎', cap: 1, text: (v) => `開寶箱時有 ${pct(v)} 機率多 1 件寶物` },
  exitSense: { name: '出口感應', icon: '🚪', bool: true, text: () => '一進入地牢就知道出口在哪裡' },
  bargain: { name: '殺價', icon: '🏷️', cap: 0.3, text: (v) => `商人的價格便宜 ${pct(v)}` },
  charm: { name: '魅力', icon: '💕', cap: 1, text: (v) => `餵食時有 ${pct(v)} 機率好感度額外 +1` },
  luck: { name: '幸運', icon: '🍀', cap: 0.6, text: (v) => `稀有生物與商人更容易出現（+${pct(v)}）` },
  magnet: { name: '磁力', icon: '🧲', bool: true, text: () => '自動吸取身旁地塊上的錢幣' },
  moleFriend: { name: '鼴鼠之友', icon: '🕳️', cap: 0.5, text: (v) => `鼴鼠洞出現機率 +${pct(v)}` },
};

export const RARITY = {
  1: { name: '普通', stars: '★', cls: 'r1' },
  2: { name: '稀有', stars: '★★', cls: 'r2' },
  3: { name: '傳說', stars: '★★★', cls: 'r3' },
};

/**
 * 飲食習慣：
 *  any  — 什麼水果都吃（+1），最愛的水果 +2
 *  attr — 只吃自己屬性的水果（+1），最愛的水果 +2
 *  only — 只吃指定的水果（+1）
 * 技能：同類型的技能在更高等級出現時視為「升級」，取最高值。
 */
export const CREATURES = {
  // ── 沙土 ──
  lizard: {
    name: '沙蜥蜴', emoji: '🦎', attr: 'sand', rarity: 1, need: 3,
    diet: { type: 'any', fav: 'sunorange' },
    desc: '喜歡趴在溫暖的沙子上曬太陽，跑起來一溜煙就不見了。',
    skills: [{ lv: 1, type: 'stepSave', v: 0.06 }, { lv: 3, type: 'coinPlus', v: 0.12 }, { lv: 5, type: 'stepSave', v: 0.12 }],
  },
  camel: {
    name: '小駱駝', emoji: '🐪', attr: 'sand', rarity: 1, need: 3,
    diet: { type: 'any', fav: 'melon' },
    desc: '駝峰裡裝滿了水果，是沙漠裡最可靠的旅伴。',
    skills: [{ lv: 1, type: 'harvest', v: 0.2 }, { lv: 3, type: 'bargain', v: 0.06 }, { lv: 5, type: 'harvest', v: 0.4 }],
  },
  scorpion: {
    name: '金尾蠍', emoji: '🦂', attr: 'sand', rarity: 2, need: 6,
    diet: { type: 'attr', fav: 'goldmango' },
    desc: '尾巴閃著金光，對寶物的氣味特別敏感。',
    skills: [{ lv: 1, type: 'treasure', v: 0.2 }, { lv: 3, type: 'vision', v: 1 }, { lv: 5, type: 'treasure', v: 0.4 }],
  },
  mole: {
    name: '鼴鼠', svg: 'mole', attr: 'sand', rarity: 2, need: 6,
    diet: { type: 'attr', fav: 'melon' },
    desc: '挖洞高手。跟著牠走，地牢裡的鼴鼠洞會變得更常見。',
    skills: [{ lv: 1, type: 'moleFriend', v: 0.2 }, { lv: 3, type: 'stepSave', v: 0.08 }, { lv: 5, type: 'moleFriend', v: 0.4 }],
  },
  scarab: {
    name: '聖甲蟲', emoji: '🪲', attr: 'sand', rarity: 3, need: 4,
    diet: { type: 'only', foods: ['goldmango'] },
    desc: '傳說中推動太陽的神聖甲蟲，身邊總是閃閃發亮。',
    skills: [{ lv: 1, type: 'magnet', v: 1 }, { lv: 3, type: 'coinPlus', v: 0.25 }, { lv: 5, type: 'luck', v: 0.3 }],
  },
  // ── 森林 ──
  squirrel: {
    name: '松鼠', emoji: '🐿️', attr: 'forest', rarity: 1, need: 3,
    diet: { type: 'any', fav: 'apple' },
    desc: '臉頰總是塞滿果實，最會找好吃的東西。',
    skills: [{ lv: 1, type: 'harvest', v: 0.2 }, { lv: 3, type: 'treasure', v: 0.12 }, { lv: 5, type: 'harvest', v: 0.4 }],
  },
  hedgehog: {
    name: '刺蝟', emoji: '🦔', attr: 'forest', rarity: 1, need: 3,
    diet: { type: 'any', fav: 'strawberry' },
    desc: '背上的刺常常黏著亮晶晶的錢幣。',
    skills: [{ lv: 1, type: 'coinPlus', v: 0.12 }, { lv: 3, type: 'stepSave', v: 0.06 }, { lv: 5, type: 'coinPlus', v: 0.25 }],
  },
  owl: {
    name: '貓頭鷹', emoji: '🦉', attr: 'forest', rarity: 2, need: 6,
    diet: { type: 'attr', fav: 'starpeach' },
    desc: '在黑暗中也看得一清二楚，是最好的嚮導。',
    skills: [{ lv: 1, type: 'vision', v: 1 }, { lv: 3, type: 'exitSense', v: 1 }, { lv: 5, type: 'vision', v: 2 }],
  },
  deer: {
    name: '林鹿', emoji: '🦌', attr: 'forest', rarity: 2, need: 6,
    diet: { type: 'attr', fav: 'starpeach' },
    desc: '腳步輕盈，跟著牠走再遠也不覺得累。',
    skills: [{ lv: 1, type: 'stepSave', v: 0.1 }, { lv: 3, type: 'charm', v: 0.25 }, { lv: 5, type: 'stepSave', v: 0.18 }],
  },
  unicorn: {
    name: '獨角獸', emoji: '🦄', attr: 'forest', rarity: 3, need: 4,
    diet: { type: 'only', foods: ['starpeach'] },
    desc: '只在星光下現身的傳說生物，會帶來好運。',
    skills: [{ lv: 1, type: 'luck', v: 0.2 }, { lv: 3, type: 'treasure', v: 0.3 }, { lv: 5, type: 'stepSave', v: 0.2 }],
  },
  // ── 沼澤 ──
  frog: {
    name: '青蛙', emoji: '🐸', attr: 'swamp', rarity: 1, need: 3,
    diet: { type: 'any', fav: 'bogberry' },
    desc: '一跳就是好幾格，呱呱。',
    skills: [{ lv: 1, type: 'stepSave', v: 0.06 }, { lv: 3, type: 'harvest', v: 0.15 }, { lv: 5, type: 'stepSave', v: 0.12 }],
  },
  snail: {
    name: '蝸牛', emoji: '🐌', attr: 'swamp', rarity: 1, need: 2,
    diet: { type: 'any', fav: 'grape' },
    desc: '慢吞吞但很討喜，大家都想跟牠做朋友。',
    skills: [{ lv: 1, type: 'charm', v: 0.2 }, { lv: 3, type: 'bargain', v: 0.06 }, { lv: 5, type: 'charm', v: 0.4 }],
  },
  turtle: {
    name: '沼龜', emoji: '🐢', attr: 'swamp', rarity: 2, need: 7,
    diet: { type: 'attr', fav: 'fireberry' },
    desc: '背殼長滿青苔，活了很久很久，記得許多寶藏的位置。',
    skills: [{ lv: 1, type: 'treasure', v: 0.15 }, { lv: 3, type: 'coinPlus', v: 0.12 }, { lv: 5, type: 'treasure', v: 0.3 }],
  },
  otter: {
    name: '水獺', emoji: '🦦', attr: 'swamp', rarity: 2, need: 6,
    diet: { type: 'attr', fav: 'grape' },
    desc: '抓魚高手，採果子也很拿手。',
    skills: [{ lv: 1, type: 'harvest', v: 0.25 }, { lv: 3, type: 'luck', v: 0.12 }, { lv: 5, type: 'magnet', v: 1 }],
  },
  dragon: {
    name: '沼澤龍', emoji: '🐉', attr: 'swamp', rarity: 3, need: 5,
    diet: { type: 'only', foods: ['fireberry'] },
    desc: '沉睡在沼澤深處的古老巨龍，據說能看穿整座地牢。',
    skills: [{ lv: 1, type: 'exitSense', v: 1 }, { lv: 3, type: 'magnet', v: 1 }, { lv: 5, type: 'luck', v: 0.3 }],
  },
};

/** 寶箱掉落表（每種屬性的寶箱不同）：[id, 權重] */
export const CHEST_LOOT = {
  sand: [
    ['melon', 14], ['sunorange', 14], ['goldmango', 6],
    ['mole_snack', 14], ['compass', 10], ['lucky_candy', 10], ['lantern', 5], ['lure_dango', 6], ['horn', 3],
  ],
  forest: [
    ['apple', 14], ['strawberry', 14], ['starpeach', 6],
    ['lantern', 12], ['lure_dango', 12], ['mole_snack', 9], ['compass', 6], ['lucky_candy', 6], ['horn', 3],
  ],
  swamp: [
    ['bogberry', 14], ['grape', 14], ['fireberry', 6],
    ['lure_dango', 10], ['lucky_candy', 12], ['mole_snack', 10], ['horn', 6], ['compass', 5], ['lantern', 5],
  ],
};

/** 依地牢大小決定內容物的數量與機率 */
export const SIZE_CONTENT = {
  2: { merchant: 0.08, hole: 0.18, creatures: [[0, 60], [1, 40]], chests: [[0, 65], [1, 35]], fruits: [[0, 50], [1, 50]], coin: 0.5 },
  3: { merchant: 0.12, hole: 0.22, creatures: [[0, 30], [1, 70]], chests: [[0, 50], [1, 50]], fruits: [[1, 60], [2, 40]], coin: 0.35 },
  4: { merchant: 0.15, hole: 0.25, creatures: [[1, 60], [2, 40]], chests: [[0, 20], [1, 65], [2, 15]], fruits: [[2, 60], [3, 40]], coin: 0.35 },
  5: { merchant: 0.2, hole: 0.3, creatures: [[1, 30], [2, 50], [3, 20]], chests: [[1, 60], [2, 40]], fruits: [[2, 40], [3, 40], [4, 20]], coin: 0.35 },
};

/** 生物稀有度的基本權重 */
export const RARITY_WEIGHTS = { 1: 72, 2: 23, 3: 5 };

/** 地底小窩 */
export const NEST_W = 6;
export const NEST_H = 5;
export const NEST_FIXED = {
  bell: { x: 0, y: 0 },
  ladder: { x: 5, y: 0 },
};

export const MERCHANT = { name: '浣熊商人', emoji: '🦝' };
