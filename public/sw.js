// public/sw.js
// Deliberately small. A service worker that caches too eagerly will serve the
// team a stale build after every Amplify deploy, which is worse than no
// service worker at all.
//
//   • HTML / navigation  → network first, cache only as an offline fallback
//   • /assets/*          → cache first (Vite gives these content-hashed names,
//                          so a new build produces new filenames and old ones
//                          simply stop being requested)
//   • Supabase, anything else → never touched
//
// Bump CACHE when you want every client to drop its old cache.

const CACHE = "teamroom-v1";
const SHELL = "/?view=room";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", SHELL]).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, fonts, CDNs: untouched

  // Navigation: always try the network, so a fresh deploy is picked up at once.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Hashed build assets: safe to serve from cache forever.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
      )
    );
  }
});

// ── Push, for later ────────────────────────────────────────────────────────
// Wired now so the plumbing exists; nothing sends pushes until we add the
// server side. An empty or malformed payload is ignored rather than showing
// the browser's own "This site has been updated in the background" notice.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { return; }
  if (!d.title) return;
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: d.tag || "team-room",
      data: { url: d.url || SHELL },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || SHELL;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow(target);
    })
  );
});
