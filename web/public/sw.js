// The service worker: network first. It asks the computer, keeps the answer, and serves the last copy only when the
// computer doesn't answer within 3 seconds or answers as down (the 502 the tailnet proxy sends while the server is
// off). No file is listed here, so a deploy needs no new worker: an ordinary reload shows the new version.
// One exception: the app's own code in /assets/ has its content's hash in its name, so a kept copy is never out of
// date: it is served from the cache first, and asked for only the first time. Each page is a file of its own there
// (web/src/pages.tsx), and the app fetches them all once the first screen is up, so every page works asleep.
// Everything else is asked for with "no-cache": the browser's own cache must check with the computer first, so a page
// it kept from before a deploy (main once sent the page without a cache header) never wins over the new one.
const CACHE = "kestrel-v7";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // the page itself goes in at once, so the very first visit already survives the computer sleeping (the files
      // that page came with, main.tsx asks for once more through this worker)
      const cache = await caches.open(CACHE);
      await cache.add(new Request("/", { cache: "no-cache" })).catch(() => {});
      await cache.delete("/api/health"); // an older worker may have kept it; a kept copy would hide a sleeping computer
      await self.clients.claim();
    })(),
  ),
);

const raced = (request) =>
  Promise.race([
    fetch(request, { cache: "no-cache" }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("no answer in 3 s")), 3000)),
  ]);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // the liveness probe and the live stream pass straight through: a kept copy of either would hide a sleeping computer
  if (url.origin !== location.origin || url.pathname === "/api/health" || url.pathname.startsWith("/api/events"))
    return;
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const kept = await cache.match(request);
        if (kept) return kept;
        const fresh = await fetch(request);
        // only the file itself: never a 404 or a page in its place, which would stick under that name
        if (fresh.ok && !(fresh.headers.get("content-type") ?? "").includes("text/html"))
          event.waitUntil(cache.put(request, fresh.clone()));
        return fresh;
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await raced(request);
        if (fresh.ok) {
          event.waitUntil(cache.put(request, fresh.clone()));
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
