// 計步系統
// 自動模式依序嘗試：① GPS 定位（每 50 公尺 = 1 步）→ ② 搖晃計步（搖 50 次 = 1 步）
// → ③ 其他方法：藍牙跑步機／步行墊／足部感應器（實際距離），或手動同步健康 App 的步行距離。

export const METHOD_LABEL = {
  gps: 'GPS 定位',
  motion: '搖晃計步',
  ble: '藍牙跑步機／計步器',
  manual: '手動同步健康 App',
};

/** GPS 精度在這個範圍內才算「定位成功」 */
export const READY_ACCURACY = 100;

/** 搖晃偵測靈敏度（動態加速度門檻，m/s²） */
export const SENSITIVITY = { low: 4.2, mid: 2.6, high: 1.6 };

const FTMS_SERVICE = 0x1826;
const TREADMILL_DATA = 0x2acd;
const RSC_SERVICE = 0x1814;
const RSC_MEASUREMENT = 0x2a53;

/** 兩個經緯度之間的距離（公尺） */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * 把一連串 GPS 定位點換算成「走了幾公尺」。
 * - 精度太差的點不計算
 * - 離上一個錨點太近視為原地飄移
 * - 速度太快（交通工具）不計算
 * 也因此在畫面關閉一陣子後回來，只要平均速度合理，期間走的直線距離仍會補算。
 */
export class GpsAccumulator {
  constructor({ maxAccuracy = 50, minMove = 8, maxSpeed = 4.5, walkSpeed = 1.4 } = {}) {
    this.maxAccuracy = maxAccuracy;
    this.minMove = minMove;
    this.maxSpeed = maxSpeed;
    this.walkSpeed = walkSpeed;
    this.anchor = null;
  }

  reset() {
    this.anchor = null;
  }

  push({ lat, lon, accuracy, t }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { meters: 0, status: 'invalid' };
    if (!(accuracy <= this.maxAccuracy)) return { meters: 0, status: 'weak' };
    const p = { lat, lon, accuracy, t };
    if (!this.anchor) {
      this.anchor = p;
      return { meters: 0, status: 'init' };
    }
    const d = haversine(this.anchor.lat, this.anchor.lon, lat, lon);
    const threshold = Math.max(this.minMove, Math.max(this.anchor.accuracy, accuracy) * 0.6);
    if (d < threshold) {
      // 還在錨點附近：更新「最後一次確認人還在這裡」的時間，
      // 這樣原地停留後突然高速移動（搭車）才判斷得出來。
      this.anchor.t = Math.max(this.anchor.t, t - (d / this.walkSpeed) * 1000);
      return { meters: 0, status: 'jitter' };
    }
    const dt = Math.max(0.5, (t - this.anchor.t) / 1000);
    const speed = d / dt;
    this.anchor = p;
    if (speed > this.maxSpeed) return { meters: 0, status: 'fast', speed };
    return { meters: d, status: 'ok', speed };
  }
}

/**
 * 從加速度（含重力）偵測「搖一下／走一步」。
 * 用低通濾波估計重力大小，動態加速度超過門檻記一次，回落後才允許下一次。
 */
export class ShakeDetector {
  constructor({ threshold = SENSITIVITY.mid, minInterval = 260, tau = 0.6 } = {}) {
    this.threshold = threshold;
    this.minInterval = minInterval;
    this.tau = tau;
    this.g = null;
    this.lastT = 0;
    this.lastPeak = -Infinity;
    this.armed = true;
  }

  push(ax, ay, az, tMs) {
    const mag = Math.hypot(ax, ay, az);
    if (!Number.isFinite(mag)) return 0;
    if (this.g === null) {
      this.g = mag;
      this.lastT = tMs;
      return 0;
    }
    const dt = Math.min(0.2, Math.max(0.001, (tMs - this.lastT) / 1000));
    this.lastT = tMs;
    this.g += (dt / (this.tau + dt)) * (mag - this.g);
    const dyn = mag - this.g;
    if (!this.armed) {
      if (dyn < this.threshold * 0.35) this.armed = true;
      return 0;
    }
    if (dyn > this.threshold && tMs - this.lastPeak >= this.minInterval) {
      this.armed = false;
      this.lastPeak = tMs;
      return 1;
    }
    return 0;
  }
}

/** FTMS Treadmill Data（0x2ACD） */
export function parseTreadmillData(dv) {
  let o = 0;
  const flags = dv.getUint16(o, true);
  o += 2;
  const out = {};
  if (!(flags & 0x0001)) {
    out.speed = dv.getUint16(o, true) / 100 / 3.6; // 0.01 km/h → m/s
    o += 2;
  }
  if (flags & 0x0002) o += 2; // 平均速度
  if (flags & 0x0004 && dv.byteLength >= o + 3) {
    out.totalDistance = dv.getUint16(o, true) | (dv.getUint8(o + 2) << 16); // 公尺
    o += 3;
  }
  return out;
}

/** Running Speed and Cadence Measurement（0x2A53） */
export function parseRscMeasurement(dv) {
  let o = 0;
  const flags = dv.getUint8(o);
  o += 1;
  const out = { speed: dv.getUint16(o, true) / 256 }; // m/s
  o += 2;
  out.cadence = dv.getUint8(o);
  o += 1;
  if (flags & 0x01) {
    out.strideLength = dv.getUint16(o, true) / 100;
    o += 2;
  }
  if (flags & 0x02 && dv.byteLength >= o + 4) {
    out.totalDistance = dv.getUint32(o, true) / 10; // 0.1 m → m
  }
  return out;
}

/** 把裝置回報的「累積距離」或「瞬間速度」轉成增加的公尺數 */
export class DistanceDelta {
  constructor() {
    this.lastTotal = null;
    this.lastT = null;
  }

  push({ totalDistance, speed }, tMs) {
    if (Number.isFinite(totalDistance)) {
      if (this.lastTotal === null || totalDistance < this.lastTotal) {
        this.lastTotal = totalDistance;
        return 0;
      }
      const d = totalDistance - this.lastTotal;
      this.lastTotal = totalDistance;
      return d > 500 ? 0 : d;
    }
    if (Number.isFinite(speed)) {
      if (this.lastT === null) {
        this.lastT = tMs;
        return 0;
      }
      const dt = Math.min(5, Math.max(0, (tMs - this.lastT) / 1000));
      this.lastT = tMs;
      return speed > 0.2 && speed < 7 ? speed * dt : 0;
    }
    return 0;
  }
}

function defaultEnv() {
  const g = globalThis;
  const nav = g.navigator || {};
  return {
    geolocation: nav.geolocation,
    bluetooth: nav.bluetooth,
    isSecureContext: g.isSecureContext,
    DeviceMotionEvent: g.DeviceMotionEvent,
    addEventListener: (...a) => g.addEventListener && g.addEventListener(...a),
    removeEventListener: (...a) => g.removeEventListener && g.removeEventListener(...a),
    setTimeout: (...a) => g.setTimeout(...a),
    clearTimeout: (...a) => g.clearTimeout(...a),
    now: () => (g.performance ? g.performance.now() : Date.now()),
  };
}

export function capabilities(env = defaultEnv()) {
  const DME = env.DeviceMotionEvent;
  return {
    gps: !!env.geolocation,
    motion: !!DME,
    motionNeedsPermission: !!DME && typeof DME.requestPermission === 'function',
    ble: !!env.bluetooth,
  };
}

export class StepTracker {
  constructor({
    onUnits = () => {}, onChange = () => {}, env = defaultEnv(),
    gpsTimeout = 20000, motionProbe = 3500, sensitivity = 'mid',
  } = {}) {
    this.onUnits = onUnits;
    this.onChange = onChange;
    this.env = env;
    this.gpsTimeout = gpsTimeout;
    this.motionProbe = motionProbe;
    this.sensitivity = sensitivity;
    this.s = {
      pref: 'auto', method: null, phase: 'idle', detail: '計步尚未啟動',
      accuracy: null, signal: null, shakes: 0, sessionUnits: 0, log: [], bleName: null,
    };
    this._cleanup = [];
    this._token = 0;
    this._motionGranted = false;
    this._shake = null;
  }

  get state() {
    return this.s;
  }

  get running() {
    return this.s.phase !== 'idle';
  }

  _set(patch) {
    Object.assign(this.s, patch);
    this.onChange(this.s);
  }

  _units(n, method) {
    if (!(n > 0)) return;
    this.s.sessionUnits += n;
    this.onUnits(n, method);
  }

  _teardown() {
    for (const fn of this._cleanup.splice(0)) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    this._shake = null;
  }

  stop() {
    this._token++;
    this._teardown();
    this._set({ method: null, phase: 'idle', detail: '計步已暫停', accuracy: null, signal: null, bleName: null });
  }

  /**
   * pref：auto｜gps｜motion｜ble｜manual。
   * gesture=true 代表是從點擊事件呼叫（iOS 授權動作感測、開啟藍牙清單都需要）。
   */
  start(pref = 'auto', { gesture = true } = {}) {
    this._token++;
    this._teardown();
    const tok = this._token;
    Object.assign(this.s, { pref, log: [], sessionUnits: 0, shakes: 0, bleName: null });
    if (pref === 'motion') return this._startMotion(tok, gesture);
    if (pref === 'ble') return this.connectBle();
    if (pref === 'manual') return this.useManual();
    return this._startGps(tok);
  }

  setSensitivity(level) {
    this.sensitivity = SENSITIVITY[level] ? level : 'mid';
    if (this._shake) this._shake.threshold = SENSITIVITY[this.sensitivity];
  }

  _ok(tok, method, detail, extra = {}) {
    if (tok !== this._token) return;
    this.s.log.push({ method, ok: true, msg: '啟動成功' });
    this._set({ method, phase: 'active', detail, ...extra });
  }

  _fail(tok, method, msg) {
    if (tok !== this._token) return;
    this._teardown();
    this.s.log.push({ method, ok: false, msg });
    if (this.s.pref !== 'auto') {
      this._set({ method, phase: 'error', detail: msg, accuracy: null, signal: null });
      return;
    }
    if (method === 'gps') {
      this._startMotion(tok, false);
      return;
    }
    this._set({ method: null, phase: 'choose', detail: msg, accuracy: null, signal: null });
  }

  // ── ① GPS ──
  _startGps(tok) {
    const geo = this.env.geolocation;
    this._set({ method: 'gps', phase: 'starting', detail: '正在取得 GPS 定位…', accuracy: null, signal: null });
    if (!geo) return this._fail(tok, 'gps', '這個瀏覽器不支援定位');
    if (this.env.isSecureContext === false) return this._fail(tok, 'gps', '需要 HTTPS 網址才能使用定位');
    const acc = new GpsAccumulator();
    let ready = false;
    let watchId = null;
    const timer = this.env.setTimeout(() => {
      if (!ready) this._fail(tok, 'gps', '定位訊號不足（等待逾時）');
    }, this.gpsTimeout);
    this._cleanup.push(() => {
      this.env.clearTimeout(timer);
      if (watchId !== null) geo.clearWatch(watchId);
    });
    const onPos = (pos) => {
      if (tok !== this._token) return;
      const { latitude, longitude, accuracy } = pos.coords;
      const t = Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now();
      const r = acc.push({ lat: latitude, lon: longitude, accuracy, t });
      if (!ready) {
        if (accuracy <= READY_ACCURACY) {
          ready = true;
          this.env.clearTimeout(timer);
          this._ok(tok, 'gps', `精度 ±${Math.round(accuracy)} m`, { accuracy, signal: 'good' });
        } else {
          this._set({ accuracy, detail: `定位精度不足（±${Math.round(accuracy)} m），繼續嘗試…` });
        }
        return;
      }
      const weak = !(accuracy <= acc.maxAccuracy);
      this._set({
        accuracy,
        signal: weak ? 'weak' : 'good',
        detail: weak ? `訊號較弱 ±${Math.round(accuracy)} m，暫不計算` : `精度 ±${Math.round(accuracy)} m`,
      });
      this._units(r.meters, 'gps');
    };
    const onErr = (err) => {
      if (tok !== this._token) return;
      if (err && err.code === 1) return this._fail(tok, 'gps', '定位權限被拒絕');
      if (!ready && err && err.code === 2) return this._fail(tok, 'gps', '無法取得位置');
      if (ready) this._set({ signal: 'weak', detail: '暫時收不到 GPS 訊號，持續嘗試中…' });
    };
    try {
      watchId = geo.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    } catch {
      this._fail(tok, 'gps', '無法啟動定位');
    }
  }

  // ── ② 搖晃計步 ──
  async _startMotion(tok, fromGesture) {
    if (tok !== this._token) return;
    const DME = this.env.DeviceMotionEvent;
    this._set({ method: 'motion', phase: 'starting', detail: '正在偵測動作感測器…', accuracy: null, signal: null });
    if (!DME) return this._fail(tok, 'motion', '這個裝置不支援動作感測');
    const needsPermission = typeof DME.requestPermission === 'function' && !this._motionGranted;
    if (needsPermission && fromGesture) {
      // iOS：必須在點擊事件裡同步呼叫 requestPermission
      let res;
      try {
        res = await DME.requestPermission();
      } catch {
        return this._fail(tok, 'motion', '無法取得動作感測權限');
      }
      if (tok !== this._token) return;
      if (res !== 'granted') return this._fail(tok, 'motion', '動作感測權限被拒絕');
      this._motionGranted = true;
    }
    // 有些瀏覽器（例如新版 Chrome）雖然有 requestPermission，其實不用授權就會送出事件，
    // 所以先聽聽看；真的收不到事件才請玩家點一下授權。
    const waitForTap = needsPermission && !fromGesture;
    const det = new ShakeDetector({ threshold: SENSITIVITY[this.sensitivity] || SENSITIVITY.mid });
    this._shake = det;
    let ready = false;
    let timer = null;
    const handler = (e) => {
      if (tok !== this._token) return;
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      if (!ready) {
        ready = true;
        this.env.clearTimeout(timer);
        this._ok(tok, 'motion', '搖一搖手機，或帶著手機走路');
      }
      const t = Number.isFinite(e.timeStamp) && e.timeStamp > 0 ? e.timeStamp : this.env.now();
      if (det.push(a.x, a.y, a.z, t)) {
        this.s.shakes += 1;
        this._units(1, 'motion');
        this._set({});
      }
    };
    this.env.addEventListener('devicemotion', handler);
    timer = this.env.setTimeout(() => {
      if (ready || tok !== this._token) return;
      if (waitForTap) this._set({ phase: 'need-gesture', detail: '需要你點一下，授權使用動作感測' });
      else this._fail(tok, 'motion', '沒有偵測到動作感測器');
    }, this.motionProbe);
    this._cleanup.push(() => {
      this.env.removeEventListener('devicemotion', handler);
      this.env.clearTimeout(timer);
    });
  }

  /** 給「點一下授權」按鈕使用（iOS 必須在點擊事件內請求權限） */
  grantMotion() {
    this._teardown();
    return this._startMotion(this._token, true);
  }

  // ── ③-a 藍牙跑步機／步行墊／足部感應器 ──
  async connectBle() {
    this._token++;
    this._teardown();
    const tok = this._token;
    const bt = this.env.bluetooth;
    this._set({ method: 'ble', phase: 'starting', detail: '請在跳出的視窗選擇藍牙裝置…', accuracy: null, signal: null });
    if (!bt) return this._fail(tok, 'ble', '這個瀏覽器不支援 Web Bluetooth（Android／電腦版 Chrome 才有）');
    let device;
    try {
      device = await bt.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }, { services: [RSC_SERVICE] }],
        optionalServices: [FTMS_SERVICE, RSC_SERVICE],
      });
    } catch (e) {
      return this._fail(tok, 'ble', e && e.name === 'NotFoundError' ? '沒有選擇藍牙裝置' : '無法開啟藍牙裝置清單');
    }
    if (tok !== this._token) return;
    try {
      this._set({ detail: `正在連線 ${device.name || '藍牙裝置'}…` });
      const server = await device.gatt.connect();
      let ch;
      let parse;
      try {
        const svc = await server.getPrimaryService(FTMS_SERVICE);
        ch = await svc.getCharacteristic(TREADMILL_DATA);
        parse = parseTreadmillData;
      } catch {
        const svc = await server.getPrimaryService(RSC_SERVICE);
        ch = await svc.getCharacteristic(RSC_MEASUREMENT);
        parse = parseRscMeasurement;
      }
      if (tok !== this._token) {
        device.gatt.disconnect();
        return;
      }
      const delta = new DistanceDelta();
      const onValue = (e) => {
        if (tok !== this._token) return;
        try {
          this._units(delta.push(parse(e.target.value), this.env.now()), 'ble');
        } catch {
          /* 忽略格式不符的封包 */
        }
      };
      const onGone = () => this._fail(tok, 'ble', '藍牙裝置已斷線');
      ch.addEventListener('characteristicvaluechanged', onValue);
      device.addEventListener('gattserverdisconnected', onGone);
      await ch.startNotifications();
      this._cleanup.push(() => {
        ch.removeEventListener('characteristicvaluechanged', onValue);
        device.removeEventListener('gattserverdisconnected', onGone);
        try {
          device.gatt.disconnect();
        } catch {
          /* ignore */
        }
      });
      const name = device.name || '藍牙裝置';
      this._ok(tok, 'ble', `已連接 ${name}`, { bleName: name });
    } catch {
      this._fail(tok, 'ble', '藍牙裝置連線失敗（需要支援 FTMS 或 RSC 的裝置）');
    }
  }

  // ── ③-b 手動同步健康 App ──
  useManual() {
    this._token++;
    this._teardown();
    this._ok(this._token, 'manual', '輸入健康 App 的今日步行距離來同步');
  }
}
