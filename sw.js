
const CACHE_VERSION = "v1";
const CACHE_NAME = `suruhbeli-${CACHE_VERSION}`;

const APP_SHELL = [
  "./index.html",
  "./index.css",
  "./index.js",
  "./home.css",
  "./lacak.css",
  "./riwayat.css",
  "./profil.css",
  "./buat-akun.css",
  "./order.css",
  "./manifest.json",
  "./logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // addAll akan gagal total kalau ada 1 aja file yang 404 — jadi
        // dipisah per-file supaya file yang gagal di-skip, bukan bikin
        // instalasi service worker gagal semua.
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => {
              console.warn("[sw] gagal cache saat install:", url, err);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("suruhbeli-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Cuma tangani GET; biarkan request lain (POST ke Firebase dll) apa adanya.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Jangan campur tangani request ke domain luar (Firebase, Google Fonts,
  // Font Awesome CDN, dsb) — biar itu selalu langsung ke network / cache
  // browser bawaan, bukan diatur service worker ini.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // Network-first: kalau berhasil, update cache dengan versi terbaru.
        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return networkRes;
      })
      .catch(() =>
        // Offline / network gagal -> coba ambil dari cache.
        caches.match(req).then((cached) => {
          if (cached) return cached;
          // Fallback terakhir untuk navigasi halaman: tampilkan index.html
          // dari cache supaya SPA tetap bisa kebuka walau offline.
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("Offline dan file tidak ada di cache.", {
            status: 503,
            statusText: "Offline",
          });
        })
      )
  );
});
