// Shared, data-free contract for the Push storage owner and presentation boundary.
// This module intentionally contains only the eight state names and their minimal view interface.
export type NotificationPushRuntimeStateKind =
  | "auth-unverified"
  | "cleanup-pending"
  | "cleanup-required"
  | "disabled"
  | "enabled"
  | "invalid"
  | "provisioning"
  | "unavailable";

export interface NotificationPushRuntimeStateView {
  readonly kind: NotificationPushRuntimeStateKind;
}
