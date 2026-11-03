/* eslint-disable */
const CACHE = 'home-studio-v2';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './logout.html',
  './manifest.webmanifest',
  './sw.js',
  './css/base.css',
  './css/views.css',
  './css/auth.css',
  './js/main.js',
  './js/ui.js',
  './js/views.js',
  './js/store.js',
  './js/sync.js',
  './js/auth.js',
  './js/profile.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/icon.svg'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // 不拦截非 GET 或跨域
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // 不拦截 API 调用（同步、健康检查等）
  if (url.pathname.startsWith('/api/')) return;
  // hash 路由的 SPA 入口
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/login.html') || url.pathname.endsWith('/logout.html')) {
    e.respondWith(netFirst(url));
    return;
  }
  // 静态资源：缓存优先，背景更新
  e.respondWith(cacheFirst(url));
});

async function cacheFirst(url) {
  const cached = await caches.match(url);
  if (cached) {
    // 后台刷新
    fetch(url).then(res => {
      if (res && res.ok) caches.open(CACHE).then(c => c.put(url, res));
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(url);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(url, clone)).catch(() => {});
    }
    return res;
  } catch (e) {
    return new Response('离线访问中', { status: 503 });
  }
}

async function netFirst(url) {
  try {
    const res = await fetch(url);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(url, clone)).catch(() => {});
    }
    return res;
  } catch (e) {
    const cached = await caches.match(url);
    if (cached) return cached;
    return new Response('网络不可用，请稍后再试', { status: 503 });
  }
}
