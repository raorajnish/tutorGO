// Service worker for web push. Registered once from PushRegistration.tsx.
// Deliberately minimal — this only shows a notification for a push event;
// it doesn't intercept fetches or cache anything (this isn't a full PWA).

self.addEventListener("push", (event) => {
  let data = { title: "TutorGO", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default title with no body.
  }

  event.waitUntil(self.registration.showNotification(data.title, { body: data.body }));
});

// Clicking the OS notification focuses an existing TutorGO tab if one is
// open, or opens a new one — rather than leaving the notification inert.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/dashboard");
    })
  );
});
