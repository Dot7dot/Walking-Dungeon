// 離線快取：連得上網路就拿最新版，斷線時改用快取（走路時訊號不好也能玩）
const CACHE = 'walking-dungeon-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/data.js',
  './js/logic.js',
  './js/rng.js',
  './js/store.js',
  './js/tracker.js',
  './js/sprites.js',
  './js/audio.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // 連得上網路時一律向伺服器確認有沒有新版本，避免發佈更新後還拿到瀏覽器快取裡的舊程式
  const fresh = req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' });
  event.respondWith(
    fetch(fresh)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')),
      ),
  );
});
