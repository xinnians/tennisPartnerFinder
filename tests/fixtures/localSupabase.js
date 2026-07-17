import { createClient } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY } from "../../src/supabaseClient.js";
import { LOCAL_SUPABASE_API_URL, loadLocalSupabaseConfig } from "./localSupabaseConfig.js";

export const SUPABASE_URL = LOCAL_SUPABASE_API_URL;

let localSupabaseConfig;

function getLocalSupabaseConfig() {
  localSupabaseConfig ??= loadLocalSupabaseConfig();
  return localSupabaseConfig;
}

export { SUPABASE_AUTH_STORAGE_KEY };

export function makeClient() {
  return createClient(SUPABASE_URL, getLocalSupabaseConfig().publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signUpUser(email) {
  const client = makeClient();
  const { data, error } = await client.auth.signUp({
    email,
    password: "password123",
  });
  if (error) throw error;
  if (!data.session) throw new Error(`Expected signUp to create a session for ${email}`);
  return { client, session: data.session };
}

export async function courtIdByName(client, name) {
  const { data, error } = await client.from("courts").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

export async function createProfile(client, profile) {
  const courtIds = [];
  for (const courtName of profile.courts ?? []) {
    courtIds.push(await courtIdByName(client, courtName));
  }

  const { data, error } = await client.rpc("save_my_profile", {
    p_nickname: profile.nickname,
    p_ntrp: profile.ntrp,
    p_line_id: profile.lineId,
    p_court_ids: courtIds,
    p_play_types: profile.playTypes ?? [],
    p_slot_codes: profile.slots ?? [],
  });
  if (error) throw error;
  return data;
}

export async function setBrowserSession(page, session) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SUPABASE_AUTH_STORAGE_KEY, value: session }
  );
}
