// The service worker: network first, always. It asks the computer, keeps the answer, and serves the last copy only
// when the computer doesn't answer within 3 seconds or answers as down (the 502 the tailnet proxy sends while the
// server is off). Nothing is precached, so a deploy needs no new worker: an ordinary reload shows the new version.
const CACHE = "kestrel-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // the page itself goes in at once, so the very first visit already survives the computer sleeping
      const cache = await caches.open(CACHE);
      await cache.add("/").catch(() => {});
      await cache.delete("/api/health"); // an older worker may have kept it; a kept copy would hide a sleeping computer
      await self.clients.claim();
    })(),
  ),
);

const raced = (request) =>
  Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error("no answer in 3 s")), 3000)),
  ]);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // the liveness probe and the live stream pass straight through: a kept copy of either would hide a sleeping computer
  if (url.origin !== location.origin || url.pathname === "/api/health" || url.pathname.startsWith("/api/events"))
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await raced(request);
        if (fresh.ok) {
          cache.put(request, fresh.clone());
          return fresh;
        }
        if (fresh.status >= 500) {
          const kept = await cache.match(request);
          if (kept) return kept;
        }
        return fresh;
      } catch {
        const kept = await cache.match(request);
        if (kept) return kept;
        if (request.mode === "navigate") {
          const shell = await cache.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});
