/* ALRO PARCEL GIS · service worker: ใช้งานออฟไลน์ได้หลังเปิดครั้งแรก
   - หน้าโปรแกรม (index.html): ดึงจากเน็ตก่อน (ได้รุ่นล่าสุดเสมอเมื่อออนไลน์) ถ้าออฟไลน์ใช้ฉบับที่เก็บไว้
   - ไฟล์อื่นในเว็บ: ใช้ฉบับที่เก็บไว้ก่อน
   - ไลบรารีภายนอก (GeoTIFF, PDF, ฟอนต์): เก็บไว้ตั้งแต่ติดตั้ง แล้วปรับให้ใหม่เมื่อออนไลน์
   เปลี่ยน VERSION เมื่อแก้ไฟล์นี้ หรือเปลี่ยนรายการไฟล์ที่ต้องเก็บ */
const VERSION = 'apg-v1';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(CORE.map(u => c.add(new Request(u, {cache: 'reload'}))));
    await Promise.allSettled(LIBS.map(async u => { const r = await fetch(u, {mode: 'no-cors'}); await c.put(u, r); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  const same = url.origin === self.location.origin;

  // หน้าโปรแกรม: เน็ตก่อน (รอไม่เกิน 4 วินาที) แล้วจึงใช้ฉบับในเครื่อง
  if (req.mode === 'navigate' || (same && /\/(index\.html)?$/.test(url.pathname))) {
    ev.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const r = await Promise.race([fetch(req, {cache: 'no-cache'}), timeout(4000)]);
        if (r && r.ok) { c.put('./index.html', r.clone()); return r; }
        throw new Error('bad response');
      } catch (e) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // ไฟล์อื่นในเว็บ: ในเครื่องก่อน
  if (same) {
    ev.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req, {ignoreSearch: true});
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch (e) { return Response.error(); }
    })());
    return;
  }

  // ไลบรารีและฟอนต์ภายนอก: ใช้ฉบับในเครื่องทันที แล้วปรับให้ใหม่เบื้องหลังเมื่อออนไลน์
  if (/(^|\.)(googleapis\.com|gstatic\.com|jsdelivr\.net|cloudflare\.com)$/.test(url.hostname)) {
    ev.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req.url);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req.url, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
