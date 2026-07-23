self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() ?? {};
  const title = typeof payload.title === "string" && payload.title ? payload.title : "球局通知";
  const body = [payload.message, payload.court].filter((value) => typeof value === "string" && value).join("\n");
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url: typeof payload.url === "string" ? payload.url : "#/" },
      icon: "/icon.svg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url ?? "#/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
      const existing = clients.find((client) => client.url === targetUrl);
      return existing ? existing.focus() : self.clients.openWindow(targetUrl);
    })
  );
});
