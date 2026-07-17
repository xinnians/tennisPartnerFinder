import { createClient } from "@supabase/supabase-js";

export const SUPABASE_AUTH_STORAGE_KEY = "tennis-partner-finder-auth";

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL ?? "";
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  Boolean(url && anonKey) && url !== "___" && anonKey !== "___";

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;
