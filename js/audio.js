// 用 WebAudio 合成的小音效，不需要任何音檔
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = !!on;
}

function audio() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac, freq, start, dur, { type = 'sine', vol = 0.07, slide = 0 } = {}) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  step: (ac) => tone(ac, 220, 0, 0.07, { type: 'triangle', vol: 0.05, slide: -60 }),
  coin: (ac) => {
    tone(ac, 988, 0, 0.08, { type: 'square', vol: 0.035 });
    tone(ac, 1319, 0.07, 0.16, { type: 'square', vol: 0.035 });
  },
  fruit: (ac) => {
    tone(ac, 523, 0, 0.09, { type: 'triangle' });
    tone(ac, 784, 0.07, 0.14, { type: 'triangle' });
  },
  chest: (ac) => [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.07, 0.18, { type: 'triangle', vol: 0.06 })),
  feed: (ac) => tone(ac, 660, 0, 0.12, { type: 'sine', vol: 0.07, slide: 220 }),
  tame: (ac) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ac, f, i * 0.09, 0.25, { type: 'sine', vol: 0.07 })),
  level: (ac) => [392, 523, 659, 784].forEach((f, i) => tone(ac, f, i * 0.08, 0.2, { type: 'square', vol: 0.03 })),
  gain: (ac) => {
    tone(ac, 880, 0, 0.1, { type: 'sine', vol: 0.06 });
    tone(ac, 1175, 0.08, 0.18, { type: 'sine', vol: 0.06 });
  },
  buy: (ac) => {
    tone(ac, 740, 0, 0.07, { type: 'square', vol: 0.03 });
    tone(ac, 988, 0.06, 0.12, { type: 'square', vol: 0.03 });
  },
  warp: (ac) => tone(ac, 900, 0, 0.45, { type: 'sine', vol: 0.06, slide: -700 }),
  bell: (ac) => {
    tone(ac, 1568, 0, 0.6, { type: 'sine', vol: 0.05 });
    tone(ac, 2093, 0.02, 0.5, { type: 'sine', vol: 0.03 });
  },
  error: (ac) => tone(ac, 160, 0, 0.16, { type: 'sawtooth', vol: 0.035 }),
};

export function sfx(name) {
  const ac = audio();
  if (!ac || !SOUNDS[name]) return;
  try {
    SOUNDS[name](ac);
  } catch {
    /* ignore */
  }
}
