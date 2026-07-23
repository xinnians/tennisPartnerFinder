function browserGlobal(value, fallback) {
  return value === undefined ? fallback : value;
}

export function vapidPublicKeyBytes(value) {
  const normalized = String(value ?? "").trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) throw new Error("缺少 Web Push 公鑰設定。");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function enableBrowserPush({
  navigatorRef,
  NotificationRef,
  vapidPublicKey,
} = {}) {
  const browserNavigator = browserGlobal(navigatorRef, globalThis.navigator);
  const BrowserNotification = browserGlobal(NotificationRef, globalThis.Notification);
  if (!browserNavigator?.serviceWorker || !BrowserNotification || !vapidPublicKey?.trim()) {
    return { status: "unsupported", subscription: null };
  }

  const permission =
    BrowserNotification.permission === "default"
      ? await BrowserNotification.requestPermission()
      : BrowserNotification.permission;
  if (permission !== "granted") return { status: permission, subscription: null };

  const registration = await browserNavigator.serviceWorker.register("/push-sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      applicationServerKey: vapidPublicKeyBytes(vapidPublicKey),
      userVisibleOnly: true,
    }));
  return { status: "granted", subscription: subscription.toJSON() };
}
