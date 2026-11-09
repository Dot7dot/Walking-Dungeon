import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversine, GpsAccumulator, ShakeDetector, parseTreadmillData, parseRscMeasurement, DistanceDelta, StepTracker,
} from '../js/tracker.js';

/** 從某點往北移動 m 公尺後的緯度 */
const north = (lat, m) => lat + m / 111195;

test('haversine 距離計算', () => {
  const d = haversine(25.0330, 121.5654, north(25.0330, 50), 121.5654);
  assert.ok(Math.abs(d - 50) < 0.2, `${d}`);
  assert.equal(haversine(1, 1, 1, 1), 0);
});

test('GPS：正常走路會累積距離', () => {
  const acc = new GpsAccumulator();
  let lat = 25.04;
  let total = 0;
  let t = 0;
  acc.push({ lat, lon: 121.5, accuracy: 6, t });
  for (let i = 0; i < 60; i++) {
    t += 1000;
    lat = north(lat, 1.4); // 每秒 1.4 m
    total += acc.push({ lat, lon: 121.5, accuracy: 6, t }).meters;
  }
  assert.ok(total > 70 && total <= 84.5, `走 84 m 算到 ${total}`);
});

test('GPS：原地飄移、精度太差、坐車都不算', () => {
  const acc = new GpsAccumulator();
  let t = 0;
  acc.push({ lat: 25, lon: 121, accuracy: 10, t });
  let total = 0;
  for (let i = 0; i < 100; i++) {
    t += 1000;
    const jitter = ((i * 7919) % 11) - 5; // ±5 m
    total += acc.push({ lat: north(25, jitter), lon: 121, accuracy: 10, t }).meters;
  }
  assert.equal(total, 0, '原地飄移');
  assert.equal(acc.push({ lat: north(25, 300), lon: 121, accuracy: 200, t: t + 1000 }).status, 'weak');
  const fast = acc.push({ lat: north(25, 300), lon: 121, accuracy: 10, t: t + 10000 });
  assert.equal(fast.status, 'fast', '10 秒 300 公尺太快了');
  assert.equal(fast.meters, 0);
});

test('GPS：螢幕關閉一段時間後回來，合理速度內會補算', () => {
  const acc = new GpsAccumulator();
  acc.push({ lat: 25, lon: 121, accuracy: 8, t: 0 });
  const r = acc.push({ lat: north(25, 600), lon: 121, accuracy: 8, t: 8 * 60 * 1000 });
  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(r.meters - 600) < 2);
});

function wave(det, { amp, hz, seconds, rate = 60 }) {
  let count = 0;
  const n = seconds * rate;
  for (let i = 0; i < n; i++) {
    const t = (i / rate) * 1000;
    const a = amp * Math.max(0, Math.sin(2 * Math.PI * hz * (i / rate))) ** 3;
    count += det.push(0.3, 9.81 + a, 0.2, t);
  }
  return count;
}

test('搖晃偵測：每一下搖晃算一次', () => {
  const det = new ShakeDetector();
  const c = wave(det, { amp: 12, hz: 2, seconds: 10 });
  assert.ok(c >= 18 && c <= 21, `搖 20 下算到 ${c}`);
});

test('搖晃偵測：靜止或輕微晃動不計算', () => {
  const det = new ShakeDetector();
  let count = 0;
  for (let i = 0; i < 600; i++) count += det.push(0.1, 9.81 + Math.sin(i) * 0.3, 0.1, i * 16);
  assert.equal(count, 0);
});

test('藍牙：解析 FTMS 跑步機資料', () => {
  // flags = 0x0004（有總距離、有瞬間速度），速度 5.00 km/h，距離 1234 m
  const buf = new DataView(new ArrayBuffer(7));
  buf.setUint16(0, 0x0004, true);
  buf.setUint16(2, 500, true);
  buf.setUint16(4, 1234 & 0xffff, true);
  buf.setUint8(6, 1234 >> 16);
  const r = parseTreadmillData(buf);
  assert.ok(Math.abs(r.speed - 5 / 3.6) < 1e-9);
  assert.equal(r.totalDistance, 1234);
  // flags 含平均速度
  const b2 = new DataView(new ArrayBuffer(9));
  b2.setUint16(0, 0x0006, true);
  b2.setUint16(2, 400, true);
  b2.setUint16(4, 380, true);
  b2.setUint16(6, 70000 & 0xffff, true);
  b2.setUint8(8, 70000 >> 16);
  assert.equal(parseTreadmillData(b2).totalDistance, 70000);
});

test('藍牙：解析 RSC 足部感應器資料', () => {
  const buf = new DataView(new ArrayBuffer(10));
  buf.setUint8(0, 0x03);
  buf.setUint16(1, 384, true); // 1.5 m/s
  buf.setUint8(3, 160);
  buf.setUint16(4, 75, true);
  buf.setUint32(6, 52345, true); // 5234.5 m
  const r = parseRscMeasurement(buf);
  assert.equal(r.speed, 1.5);
  assert.equal(r.cadence, 160);
  assert.equal(r.strideLength, 0.75);
  assert.equal(r.totalDistance, 5234.5);
});

test('藍牙：累積距離轉成增量', () => {
  const d = new DistanceDelta();
  assert.equal(d.push({ totalDistance: 1000 }, 0), 0);
  assert.equal(d.push({ totalDistance: 1012 }, 1000), 12);
  assert.equal(d.push({ totalDistance: 5 }, 2000), 0, '裝置重置');
  assert.equal(d.push({ totalDistance: 9 }, 3000), 4);
  const s = new DistanceDelta();
  s.push({ speed: 1.5 }, 0);
  assert.ok(Math.abs(s.push({ speed: 1.5 }, 2000) - 3) < 1e-9);
});

// ── StepTracker 自動退回流程 ──

function fakeEnv({ geo = null, dme = null } = {}) {
  const listeners = {};
  const timers = [];
  return {
    env: {
      geolocation: geo,
      bluetooth: undefined,
      isSecureContext: true,
      DeviceMotionEvent: dme,
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
      removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
      setTimeout: (fn, ms) => { timers.push({ fn, ms, done: false }); return timers.length - 1; },
      clearTimeout: (id) => { if (timers[id]) timers[id].done = true; },
      now: () => 0,
    },
    fire(type, ev) { for (const fn of listeners[type] || []) fn(ev); },
    runTimers() { for (const t of timers.slice()) if (!t.done) { t.done = true; t.fn(); } },
    listeners,
  };
}

function fakeGeo() {
  const g = { ok: null, err: null, cleared: false };
  g.watchPosition = (ok, err) => { g.ok = ok; g.err = err; return 1; };
  g.clearWatch = () => { g.cleared = true; };
  return g;
}

test('自動模式：GPS 成功就使用 GPS，並換算距離', () => {
  const geo = fakeGeo();
  const f = fakeEnv({ geo, dme: function DME() {} });
  let units = 0;
  const tr = new StepTracker({ env: f.env, onUnits: (n) => { units += n; } });
  tr.start('auto');
  assert.equal(tr.state.phase, 'starting');
  geo.ok({ coords: { latitude: 25, longitude: 121, accuracy: 8 }, timestamp: 0 });
  assert.equal(tr.state.phase, 'active');
  assert.equal(tr.state.method, 'gps');
  geo.ok({ coords: { latitude: north(25, 60), longitude: 121, accuracy: 8 }, timestamp: 40000 });
  assert.ok(Math.abs(units - 60) < 0.5);
  tr.stop();
  assert.ok(geo.cleared);
  assert.equal(tr.state.phase, 'idle');
});

test('自動模式：GPS 被拒絕 → 改用搖晃計步', () => {
  const geo = fakeGeo();
  const f = fakeEnv({ geo, dme: function DME() {} });
  let units = 0;
  const tr = new StepTracker({ env: f.env, onUnits: (n) => { units += n; } });
  tr.start('auto');
  geo.err({ code: 1 });
  assert.equal(tr.state.method, 'motion');
  assert.equal(tr.state.log[0].ok, false);
  // 收到動作事件 → 啟動成功
  for (let i = 0; i < 600; i++) {
    const a = 12 * Math.max(0, Math.sin(2 * Math.PI * 2 * (i / 60))) ** 3;
    f.fire('devicemotion', { accelerationIncludingGravity: { x: 0, y: 9.81 + a, z: 0 }, timeStamp: (i / 60) * 1000 + 1 });
  }
  assert.equal(tr.state.phase, 'active');
  assert.ok(units >= 18, `shakes ${units}`);
});

test('自動模式：GPS 逾時、動作感測也沒反應 → 讓玩家選擇其他方法', () => {
  const geo = fakeGeo();
  const f = fakeEnv({ geo, dme: function DME() {} });
  const tr = new StepTracker({ env: f.env });
  tr.start('auto');
  f.runTimers(); // GPS 逾時
  assert.equal(tr.state.method, 'motion');
  f.runTimers(); // 沒有動作事件
  assert.equal(tr.state.phase, 'choose');
  assert.equal(tr.state.log.length, 2);
  tr.useManual();
  assert.equal(tr.state.phase, 'active');
  assert.equal(tr.state.method, 'manual');
});

test('自動模式：沒有 GPS 也沒有動作感測的裝置', () => {
  const f = fakeEnv();
  const tr = new StepTracker({ env: f.env });
  tr.start('auto');
  assert.equal(tr.state.phase, 'choose');
});

test('iOS：動作感測需要點一下授權', async () => {
  const geo = fakeGeo();
  let asked = 0;
  const DME = function DME() {};
  DME.requestPermission = async () => { asked++; return 'granted'; };
  const f = fakeEnv({ geo, dme: DME });
  const tr = new StepTracker({ env: f.env });
  tr.start('auto');
  geo.err({ code: 1 });
  assert.equal(tr.state.method, 'motion');
  assert.equal(tr.state.phase, 'starting', '先聽聽看有沒有事件');
  f.runTimers();
  assert.equal(tr.state.phase, 'need-gesture', '收不到事件才請玩家點一下');
  await tr.grantMotion();
  assert.equal(asked, 1);
  f.fire('devicemotion', { accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 }, timeStamp: 1 });
  assert.equal(tr.state.phase, 'active');
  assert.equal(tr.state.method, 'motion');
});

test('指定 GPS 失敗時不自動切換，顯示錯誤', () => {
  const geo = fakeGeo();
  const f = fakeEnv({ geo, dme: function DME() {} });
  const tr = new StepTracker({ env: f.env });
  tr.start('gps');
  geo.err({ code: 1 });
  assert.equal(tr.state.phase, 'error');
  assert.equal(tr.state.method, 'gps');
});

test('有 requestPermission 但不需授權的瀏覽器：收到事件就直接啟用', () => {
  const geo = fakeGeo();
  const DME = function DME() {};
  DME.requestPermission = async () => 'granted';
  const f = fakeEnv({ geo, dme: DME });
  const tr = new StepTracker({ env: f.env });
  tr.start('auto');
  geo.err({ code: 1 });
  f.fire('devicemotion', { accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 }, timeStamp: 5 });
  assert.equal(tr.state.phase, 'active');
  assert.equal(tr.state.method, 'motion');
});
