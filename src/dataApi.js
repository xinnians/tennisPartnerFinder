import { COURTS, REGISTERED_PLAYERS, DEMAND_PINS } from "./mockData.js";
import { isSupabaseConfigured, supabase, SUPABASE_AUTH_STORAGE_KEY } from "./supabaseClient.js";

const slotLabels = {
  "wd-m": "平日早上",
  "wd-a": "平日下午",
  "wd-e": "平日晚上",
  "we-m": "週末早上",
  "we-a": "週末下午",
  "we-e": "週末晚上",
};

function requireSupabase() {
  if (!supabase) throw new Error("Supabase 尚未設定");
  return supabase;
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function withDefaultArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapDiscoveryRow(row) {
  return {
    id: `profile-${row.profile_id}-court-${row.court_id}`,
    profileId: row.profile_id,
    displayName: row.nickname,
    ntrp: asNumber(row.ntrp) ?? 3.5,
    goals: withDefaultArray(row.play_types),
    homeCourt: row.court_name,
    courtDistrict: row.court_district ?? "",
    courtLat: asNumber(row.court_lat),
    courtLng: asNumber(row.court_lng),
    availability: withDefaultArray(row.slot_codes).map((code) => slotLabels[code] ?? code),
    lineId: row.line_id ?? "",
  };
}

function mapRequestRow(row) {
  const court = row.court;
  const desired = row.desired_time_text ? `${row.desired_time_text}・` : "";
  return {
    id: `request-${row.id}`,
    requestId: row.id,
    court: court?.name ?? "台北市球場",
    courtDistrict: court?.district ?? "",
    courtLat: asNumber(court?.lat),
    courtLng: asNumber(court?.lng),
    ntrp: asNumber(row.ntrp_min),
    rawSkill: row.raw_skill_text || null,
    demandText: `${desired}${row.request_text}`,
    sourceUrl: "",
  };
}

function normalizeProfile(row, related) {
  return {
    id: row.id,
    nick: row.nickname,
    ntrp: asNumber(row.ntrp) ?? 3.5,
    types: new Set(related.playTypes),
    courts: new Set(related.courts.map((court) => court.name)),
    slots: new Set(related.slots),
    share: Boolean(row.is_public),
    lineId: row.line_id ?? "",
  };
}

async function currentUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

export async function getInitialSession() {
  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (data.session) return data.session;

  const stored = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
  if (!stored) return null;

  try {
    const session = JSON.parse(stored);
    if (!session?.access_token || !session?.refresh_token) return null;
    const { data: restored, error } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) throw error;
    return restored.session;
  } catch (error) {
    console.warn("無法還原 Supabase session", error);
    return null;
  }
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {};
  const client = requireSupabase();
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithOAuthProvider(provider) {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadCourts() {
  if (!isSupabaseConfigured) return COURTS;
  const client = requireSupabase();
  const { data, error } = await client
    .from("courts")
    .select("id,name,district,lat,lng")
    .eq("is_active", true)
    .order("id");
  if (error) throw error;
  return data.map((court) => ({
    ...court,
    lat: asNumber(court.lat),
    lng: asNumber(court.lng),
  }));
}

export async function loadDiscoveryPlayers() {
  if (!isSupabaseConfigured) return REGISTERED_PLAYERS;
  const client = requireSupabase();
  const { data, error } = await client.from("public_profile_discovery").select("*");
  if (error) throw error;
  return data.map(mapDiscoveryRow);
}

export async function loadActivePartnerRequests() {
  if (!isSupabaseConfigured) return DEMAND_PINS;
  const client = requireSupabase();
  const { data, error } = await client
    .from("partner_requests")
    .select(
      "id,desired_time_text,ntrp_min,ntrp_max,raw_skill_text,request_text,expires_at,court:courts(id,name,district,lat,lng)"
    )
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapRequestRow);
}

export async function loadCurrentProfile() {
  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();
  const userId = await currentUserId();
  if (!userId) return null;

  const { data: profile, error } = await client
    .from("profiles")
    .select("id,nickname,ntrp,line_id,is_public")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const [{ data: courtRows, error: courtsError }, { data: typeRows, error: typesError }, { data: slotRows, error: slotsError }] =
    await Promise.all([
      client.from("profile_courts").select("court:courts(id,name,district,lat,lng)").eq("profile_id", profile.id),
      client.from("profile_play_types").select("play_type").eq("profile_id", profile.id),
      client.from("profile_slots").select("slot_code").eq("profile_id", profile.id),
    ]);

  if (courtsError) throw courtsError;
  if (typesError) throw typesError;
  if (slotsError) throw slotsError;

  return normalizeProfile(profile, {
    courts: courtRows.map((row) => row.court).filter(Boolean),
    playTypes: typeRows.map((row) => row.play_type),
    slots: slotRows.map((row) => row.slot_code),
  });
}

export async function saveCurrentProfile(profile) {
  const client = requireSupabase();
  const userId = await currentUserId();
  if (!userId) throw new Error("請先登入");

  const { data: saved, error } = await client
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        nickname: profile.nick,
        ntrp: profile.ntrp,
        line_id: profile.lineId,
        is_public: profile.share,
      },
      { onConflict: "user_id" }
    )
    .select("id,nickname,ntrp,line_id,is_public")
    .single();
  if (error) throw error;

  const profileId = saved.id;
  const courts = await loadCourts();
  const courtIds = courts.filter((court) => profile.courts.has(court.name)).map((court) => court.id);

  const deleteSteps = [
    client.from("profile_courts").delete().eq("profile_id", profileId),
    client.from("profile_play_types").delete().eq("profile_id", profileId),
    client.from("profile_slots").delete().eq("profile_id", profileId),
  ];
  const deleteResults = await Promise.all(deleteSteps);
  const deleteError = deleteResults.find((result) => result.error)?.error;
  if (deleteError) throw deleteError;

  const insertSteps = [];
  if (courtIds.length) {
    insertSteps.push(
      client.from("profile_courts").insert(courtIds.map((court_id) => ({ profile_id: profileId, court_id })))
    );
  }
  if (profile.types.size) {
    insertSteps.push(
      client
        .from("profile_play_types")
        .insert([...profile.types].map((play_type) => ({ profile_id: profileId, play_type })))
    );
  }
  if (profile.slots.size) {
    insertSteps.push(
      client.from("profile_slots").insert([...profile.slots].map((slot_code) => ({ profile_id: profileId, slot_code })))
    );
  }

  const insertResults = await Promise.all(insertSteps);
  const insertError = insertResults.find((result) => result.error)?.error;
  if (insertError) throw insertError;

  return loadCurrentProfile();
}

export async function createPartnerRequest({ courtId, desiredTimeText, rawSkillText, requestText }) {
  const client = requireSupabase();
  const profile = await loadCurrentProfile();
  if (!profile?.id) throw new Error("請先建立個人檔案");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await client.from("partner_requests").insert({
    profile_id: profile.id,
    court_id: courtId,
    desired_time_text: desiredTimeText,
    raw_skill_text: rawSkillText,
    request_text: requestText,
    status: "open",
    expires_at: expiresAt,
  });
  if (error) throw error;
}

export async function createReport({ reportedProfileId = null, partnerRequestId = null, reason }) {
  const client = requireSupabase();
  const profile = await loadCurrentProfile();
  if (!profile?.id) throw new Error("請先建立個人檔案");
  if (!reportedProfileId && !partnerRequestId) throw new Error("缺少檢舉目標");

  const { error } = await client.from("reports").insert({
    reporter_profile_id: profile.id,
    reported_profile_id: reportedProfileId,
    partner_request_id: partnerRequestId,
    reason,
  });
  if (error) throw error;
}
