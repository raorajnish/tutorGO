/**
 * TutorGO service worker (changes-phase11.md §11.3).
 *
 * Two jobs, kept in one file because they share the lifecycle:
 *  1. Web push — a notification event shows an OS notification; clicking it
 *     deep-links into the app instead of always opening /dashboard.
 *  2. PWA shell caching — stale-while-revalidate for the app shell/static
 *     assets, so a repeat visit paints instantly and a flaky connection still
 *     shows *something*.
 *
 * The one rule that overrides everything else below: **/api/* is never
 * cached.** Every API response is tenant- and user-scoped — a cached fee
 * record or attendance row sitting in this cache is another student's data
 * waiting to be served to whoever next opens the browser on a shared family
 * phone. API requests are explicitly left alone (the fetch handler returns
 * before calling `respondWith`), so they always go straight to the network
 * with the browser's own normal behaviour.
 */

// Bump this string on every deploy that changes what's precached — activate()
// below deletes every cache whose name doesn't match, so a stale version
// never lingers on someone's phone for weeks.
const CACHE_VERSION = "tutorgo-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// A small, deliberately short list — just enough that a cold, offline open
// shows the app chrome and an honest "you're offline" screen rather than the
// browser's own dinosaur-game error page. Everything else fills in via
// stale-while-revalidate as it's actually visited.
const SHELL_URLS = ["/", "/offline"];

self.addEventListener("install", (event) => {
  // Deliberately does NOT call skipWaiting() here. A worker that installs
  // itself unconditionally takes over every open tab immediately — including
  // one where a parent is mid-way through a fee-proof upload — which is
  // exactly the "swapping the app out from under someone mid-form" failure
  // mode this design exists to avoid. Instead this worker sits in the
  // "waiting" state until PwaRegister.tsx explicitly asks it to activate
  // (see the "message" listener below), after the user has clicked Reload.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== SHELL_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// PwaRegister.tsx posts this once the user has clicked "Reload" on the
// update prompt — only then does the waiting worker actually take over.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only ever handle same-origin GETs. A POST/PATCH/DELETE can't be served
  // from a cache meaningfully, and a cross-origin request (Cloudinary, a
  // third-party script) is someone else's caching policy to set, not ours.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // The one non-negotiable rule — see the file header. Returning without
  // calling respondWith() means this request is untouched: the browser
  // handles it exactly as if this service worker didn't exist.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations (a real page load / refresh, not an asset fetch): network
  // first, since the app shell is client-rendered and the freshest HTML is
  // always preferred. Falls back to the cached shell, then the offline page,
  // only when the network genuinely isn't reachable.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match(event.request)) ?? (await caches.match("/offline")) ?? Response.error()
      )
    );
    return;
  }

  // Everything else same-origin (JS/CSS chunks, fonts, icons): stale-while-
  // revalidate — serve the cached copy immediately if there is one, and
  // refresh the cache in the background so the *next* visit is up to date.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "TutorGO", body: "", tag: undefined, url: undefined };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default title with no body.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // Same tag replaces the previous notification instead of stacking —
      // see services/push.ts's PushInput.tag doc.
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/portal" },
    })
  );
});

// Clicking the OS notification deep-links into whatever screen the event was
// actually about (e.g. /portal/fees for a fee reminder) rather than always
// opening /dashboard — which a STUDENT login can't even reach. Reuses an
// already-open TutorGO tab when one exists instead of piling up new ones.
self.addEventListener("notificationclick", (event) => {
  const targetUrl = event.notification.data?.url ?? "/portal";
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
