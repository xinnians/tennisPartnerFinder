import type { NotificationPreferences } from "./domainTypes.ts";

const NOTIFICATION_PREFERENCE_KEYS = Object.freeze([
  "chatMessageEnabled",
  "guestInvitedEnabled",
  "guestRequestReviewedEnabled",
  "hostNewRequestEnabled",
  "sessionReminderEnabled",
  "sessionUpdatedEnabled",
] satisfies ReadonlyArray<keyof NotificationPreferences>);

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    chatMessageEnabled: true,
    guestInvitedEnabled: true,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: true,
    sessionReminderEnabled: true,
    sessionUpdatedEnabled: true,
  };
}

/** Read compatibility: absent legacy columns remain enabled. */
export function notificationPreferencesForRead(
  preferences: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences {
  const normalized = defaultNotificationPreferences();
  for (const key of NOTIFICATION_PREFERENCE_KEYS) normalized[key] = preferences?.[key] !== false;
  return normalized;
}

/** Write safety: only explicit true is sent as enabled; absent fields stay disabled. */
export function notificationPreferencesForWrite(
  preferences: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences {
  const normalized = defaultNotificationPreferences();
  for (const key of NOTIFICATION_PREFERENCE_KEYS) normalized[key] = preferences?.[key] === true;
  return normalized;
}
