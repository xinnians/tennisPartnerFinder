import { WEB_PUSH_VAPID_PUBLIC_KEY } from "../../config.ts";
import type { ControllerAuthSession } from "../../controllerContracts.ts";
import {
  isSupabaseConfigured,
  loadCourtSubscriptions,
  loadNotificationPreferences,
  saveCourtSubscriptions,
  saveNotificationPreferences,
  savePushSubscription,
} from "../../dataApi.ts";
// eslint-disable-next-line no-restricted-imports -- 既有通知球場純型別尚無可由 JavaScript facade 匯出的 type barrel。
import type { DataCourt } from "../../data/mappers/profileMappers.ts";
import type { NotificationPreferences } from "../../domainTypes.ts";
import { defaultNotificationPreferences, notificationPreferencesForWrite } from "../../notificationPreferences.ts";
import { enableBrowserPush } from "../../notificationPush.js";

export type NotificationPushStatus = "denied" | "enabled" | "idle" | "unsupported";

export interface NotificationSettings {
  courtIds: number[];
  errorMessage: string;
  prefs: NotificationPreferences;
  pushStatus: NotificationPushStatus;
  webPushConfigured: boolean;
}

interface NotificationAuthRequest {
  identity: string | null;
  isStale(): boolean;
}

interface BrowserPushResult {
  status: string;
  subscription: {
    endpoint?: unknown;
    keys?: { auth?: unknown; p256dh?: unknown };
  } | null;
}

interface NotificationFeatureOptions {
  captureAuthRequest(): NotificationAuthRequest;
  getAuthSession(): ControllerAuthSession | null;
  getCourts(): readonly DataCourt[];
  getSettings(): NotificationSettings;
  rerenderVisibleSettings(): void;
  setSettings(settings: NotificationSettings): void;
  toast(message: string): void;
}

export interface NotificationFeature {
  enablePushNotifications(): Promise<NotificationPushStatus | undefined>;
  refreshNotificationSettings(): Promise<boolean>;
  seedAllTaipeiCourtSubscriptions(): Promise<void>;
  updateCourtSubscriptions(courtIds: unknown): Promise<void>;
  updateNotificationPreferences(preferences: Partial<NotificationPreferences> | null | undefined): Promise<void>;
}

export function defaultNotificationSettings(): NotificationSettings {
  return {
    courtIds: [],
    errorMessage: "",
    prefs: defaultNotificationPreferences(),
    pushStatus: "idle",
    webPushConfigured: Boolean(WEB_PUSH_VAPID_PUBLIC_KEY.trim()),
  };
}

export function createNotificationFeature(options: NotificationFeatureOptions): NotificationFeature {
  const updateSettings = (patch: Partial<NotificationSettings>) => {
    options.setSettings({ ...options.getSettings(), ...patch });
  };

  async function refreshNotificationSettings(): Promise<boolean> {
    const request = options.captureAuthRequest();
    if (!request.identity || !options.getAuthSession() || !isSupabaseConfigured) return false;
    try {
      const [prefs, courtIds] = await Promise.all([loadNotificationPreferences(), loadCourtSubscriptions()]);
      if (request.isStale()) return false;
      updateSettings({
        courtIds,
        errorMessage: "",
        prefs,
        webPushConfigured: Boolean(WEB_PUSH_VAPID_PUBLIC_KEY.trim()),
      });
    } catch {
      if (request.isStale()) return false;
      updateSettings({ errorMessage: "通知設定暫時無法載入，請稍後再試。" });
    }
    options.rerenderVisibleSettings();
    return true;
  }

  async function updateNotificationPreferences(
    preferences: Partial<NotificationPreferences> | null | undefined
  ): Promise<void> {
    const request = options.captureAuthRequest();
    if (!request.identity || !options.getAuthSession()) throw new Error("請先登入後再調整通知設定。");
    const nextPreferences = notificationPreferencesForWrite(preferences);
    await saveNotificationPreferences(nextPreferences);
    if (request.isStale()) return;
    updateSettings({ errorMessage: "", prefs: nextPreferences });
    options.rerenderVisibleSettings();
    options.toast("通知偏好已儲存。");
  }

  async function updateCourtSubscriptions(courtIds: unknown): Promise<void> {
    const request = options.captureAuthRequest();
    if (!request.identity || !options.getAuthSession()) throw new Error("請先登入後再調整通知設定。");
    const nextCourtIds = [
      ...new Set(
        (Array.isArray(courtIds) ? courtIds : [])
          .map(Number)
          .filter((courtId) => Number.isSafeInteger(courtId) && courtId > 0)
      ),
    ];
    const activeTaipeiCourtCount = options.getCourts().filter((court) => court?.city === "台北市").length;
    if (activeTaipeiCourtCount > 0 && nextCourtIds.length > activeTaipeiCourtCount) {
      throw new Error("訂閱球場數量超過目前可選的台北市球場。");
    }
    await saveCourtSubscriptions(nextCourtIds);
    if (request.isStale()) return;
    updateSettings({ courtIds: nextCourtIds, errorMessage: "" });
    options.rerenderVisibleSettings();
    options.toast("球場訂閱已儲存。");
  }

  /**
   * 新帳號第一次把個人檔案存進資料庫時,預設訂閱全部台北市 active 球場。
   *
   * 只在存檔前資料庫沒有任何 profiles 列時執行(見 main.js storedProfileExists 的說明),所以
   * 它永遠不會覆蓋任何既有選擇——包含「先在通知設定訂了再全部取消、之後才建檔」這條路徑,
   * 因為那次取消已經讓 ensure_notification_profile 建好了列。
   *
   * 走既有的 saveCourtSubscriptions(set_court_subscriptions RPC),不新開資料路徑。
   * 任何失敗都吞掉:個人檔案是主要動作,訂閱種入是附帶的,不可讓使用者看到存檔失敗。
   */
  async function seedAllTaipeiCourtSubscriptions(): Promise<void> {
    const request = options.captureAuthRequest();
    const courtIds = options
      .getCourts()
      .filter((court) => court?.city === "台北市")
      .map((court) => Number(court?.id))
      .filter((courtId) => Number.isSafeInteger(courtId) && courtId > 0);
    // 球場清單還沒載入就跳過:寧可不種,也不能因此讓存檔流程出錯。
    if (!courtIds.length) return;
    try {
      await saveCourtSubscriptions(courtIds);
    } catch {
      return;
    }
    if (request.isStale()) return;
    updateSettings({ courtIds, errorMessage: "" });
    options.rerenderVisibleSettings();
  }

  async function enablePushNotifications(): Promise<NotificationPushStatus | undefined> {
    const request = options.captureAuthRequest();
    if (!request.identity || !options.getAuthSession()) throw new Error("請先登入後再開啟推播。");
    if (!WEB_PUSH_VAPID_PUBLIC_KEY.trim()) {
      updateSettings({ pushStatus: "unsupported" });
      options.rerenderVisibleSettings();
      return "unsupported";
    }
    const result: BrowserPushResult = await enableBrowserPush({
      vapidPublicKey: WEB_PUSH_VAPID_PUBLIC_KEY,
    });
    if (request.isStale()) return;
    if (result.status !== "granted" || !result.subscription) {
      const pushStatus =
        result.status === "denied" ? "denied" : result.status === "unsupported" ? "unsupported" : "idle";
      updateSettings({ errorMessage: "", pushStatus });
      options.rerenderVisibleSettings();
      return pushStatus;
    }
    await savePushSubscription(result.subscription);
    if (request.isStale()) return;
    updateSettings({ errorMessage: "", pushStatus: "enabled" });
    options.rerenderVisibleSettings();
    options.toast("已開啟推播通知。");
    return "enabled";
  }

  return {
    enablePushNotifications,
    refreshNotificationSettings,
    seedAllTaipeiCourtSubscriptions,
    updateCourtSubscriptions,
    updateNotificationPreferences,
  };
}
