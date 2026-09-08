function notificationUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "#/", self.location.origin);
    if (url.origin === self.location.origin && !url.username && !url.password) return url.href;
  } catch { /* A malformed notification still opens the app safely. */ }
  return new URL("#/", self.location.origin).href;
}

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json?.() ?? {}; } catch { /* Show a generic notification. */ }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "球咖通知";
  const body = [payload.message, payload.court].filter((value) => typeof value === "string" && value).join("\n");
  const tag = typeof payload.notificationId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(payload.notificationId)
    ? payload.notificationId : undefined;
  event.waitUntil(self.registration.showNotification(title, {
    body, data: { url: notificationUrl(payload.url) }, icon: "/icon.svg", ...(tag ? { tag } : {}),
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = notificationUrl(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(async (clients) => {
    const existing = clients.find((client) => client.url === targetUrl);
    if (existing) return existing.focus();
    const app = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (app) {
      const navigated = await app.navigate(targetUrl);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
