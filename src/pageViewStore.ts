import type { ControllerIdentifier } from "./controllerContracts.ts";
import type { NotificationPreferences } from "./domainTypes.ts";
import type { Store } from "./sessionStore.ts";

export interface PageNotificationSettings {
  courtIds?: Array<number | string>;
  errorMessage?: string;
  prefs?: Partial<NotificationPreferences>;
  pushStatus?: string;
  webPushConfigured?: boolean;
}

export interface PageViewState {
  createdSessionFocusId: ControllerIdentifier;
  createdSessionFocusReason: string | null;
  notificationSettings: PageNotificationSettings;
  presenceLocationStatus: string;
}

export type PageViewChannel = "me" | "mySessions";
export type PageViewStore = Store<PageViewState, PageViewChannel>;
