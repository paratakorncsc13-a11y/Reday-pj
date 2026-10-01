/* ReDay v2 — service worker: ใช้งานได้เมื่อเน็ตไม่ดี
 * ไฟล์ของแอปเองใช้ network-first (ได้ของใหม่เสมอเมื่อออนไลน์) แล้วสำรองจาก cache เมื่อออฟไลน์
 * ข้อมูลของผู้ใช้อยู่ใน localStorage อยู่แล้ว จึงเปิดและบันทึกได้แม้ออฟไลน์
 */
const CACHE = 'reday-v2.0.0';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/config.js', 'js/time.js', 'js/messages.js', 'js/engine.js', 'js/store.js', 'js/ui.js', 'js/actions.js',
  'js/pages/public.js', 'js/pages/onboarding.js', 'js/pages/today.js', 'js/pages/plan.js', 'js/pages/room.js',
  'js/pages/summary.js', 'js/pages/me.js', 'js/pages/guide.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
