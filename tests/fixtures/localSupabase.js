import { createClient } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY } from "../../src/supabaseClient.js";

export const SUPABASE_URL = "http://127.0.0.1:54321";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJhc3ViYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export { SUPABASE_AUTH_STORAGE_KEY };

export function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  const { data, error } = await client
    .from("profiles")
    .insert({
      nickname: profile.nickname,
      ntrp: profile.ntrp,
      line_id: profile.lineId,
      is_public: profile.isPublic,
      user_id: profile.userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const profileId = data.id;
  const courtIds = [];
  for (const courtName of profile.courts ?? []) {
    courtIds.push(await courtIdByName(client, courtName));
  }

  if (courtIds.length > 0) {
    const { error: courtsError } = await client
      .from("profile_courts")
      .insert(courtIds.map((court_id) => ({ profile_id: profileId, court_id })));
    if (courtsError) throw courtsError;
  }

  if ((profile.playTypes ?? []).length > 0) {
    const { error: typesError } = await client
      .from("profile_play_types")
      .insert(profile.playTypes.map((play_type) => ({ profile_id: profileId, play_type })));
    if (typesError) throw typesError;
  }

  if ((profile.slots ?? []).length > 0) {
    const { error: slotsError } = await client
      .from("profile_slots")
      .insert(profile.slots.map((slot_code) => ({ profile_id: profileId, slot_code })));
    if (slotsError) throw slotsError;
  }

  return profileId;
}

export async function setBrowserSession(page, session) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SUPABASE_AUTH_STORAGE_KEY, value: session }
  );
}
