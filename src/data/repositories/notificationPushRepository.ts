import { supabase } from "../../supabaseClient.js";
import { DataApiUnavailableError, asDataApiError } from "../dataErrors.ts";
import { createNotificationPushOwnerQuarantineRpc } from "../../notificationPushOwnerQuarantineRpc.ts";
import type { PushOwnerQuarantineRpc } from "../../notificationPushOwnerQuarantine.ts";

export async function loadNotificationPushRuntimeStatus(): Promise<boolean> {
  if (!supabase) throw new DataApiUnavailableError();
  const { data, error } = await supabase.rpc("notification_push_runtime_status");
  if (error) throw asDataApiError(error);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Reflect.ownKeys(data).length !== 1 ||
    typeof data.enabled !== "boolean"
  ) {
    throw new Error("Invalid push runtime status");
  }
  return data.enabled;
}

export const quarantinePushDevice: PushOwnerQuarantineRpc = (...args) => {
  if (!supabase) throw new DataApiUnavailableError();
  return createNotificationPushOwnerQuarantineRpc({ client: supabase })(...args);
};
