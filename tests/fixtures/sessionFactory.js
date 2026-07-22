const HOUR_MS = 60 * 60 * 1000;

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Session fixture requires a valid date");
  return date;
}

function requireCourtId(courtId) {
  if (!Number.isSafeInteger(courtId) || courtId <= 0) {
    throw new Error("Session fixture requires a positive court ID");
  }
  return courtId;
}

export function createIsoSafeRunId(now = new Date(), suffix = Math.random().toString(36).slice(2, 10)) {
  const timestamp = asDate(now).toISOString().replace(/[-:.]/g, "");
  const safeSuffix = String(suffix).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!safeSuffix) throw new Error("Session fixture requires an ISO-safe suffix");
  return `${timestamp}-${safeSuffix}`;
}

function createActor(role, runId) {
  return {
    email: `${role}-${runId}@example.test`,
    nickname: `${role}-${runId}`,
    ntrp: 3.5,
    lineId: `${role}_${runId}`,
    isPublic: false,
    courts: ["青年公園網球場"],
    playTypes: ["單打"],
    slots: ["we-m"],
  };
}

export function createSessionTestContext({ now = new Date(), suffix } = {}) {
  const runId = createIsoSafeRunId(now, suffix);
  return {
    runId,
    host: createActor("host", runId),
    guest: createActor("guest", runId),
    observer: createActor("observer", runId),
  };
}

export function createFutureSessionInput({ now = new Date(), startAt, courtId, ...overrides } = {}) {
  const current = asDate(now);
  return {
    courtId: requireCourtId(courtId),
    startAt: startAt ?? new Date(current.getTime() + 24 * HOUR_MS).toISOString(),
    playType: "單打",
    ntrpMin: 3.0,
    ntrpMax: 4.0,
    slotsTotal: 1,
    notes: "session fixture",
    joinMode: "approval",
    ...overrides,
  };
}

export function createStartedSessionInput({ now = new Date(), startAt, ...overrides } = {}) {
  const current = asDate(now);
  return createFutureSessionInput({
    ...overrides,
    now: current,
    startAt: startAt ?? new Date(current.getTime() - HOUR_MS).toISOString(),
  });
}

export async function callSessionRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function createSessionViaRpc(client, session) {
  const courtId = requireCourtId(session?.courtId);
  return callSessionRpc(client, "create_session", {
    p_court_id: courtId,
    p_start_at: session.startAt,
    p_play_type: session.playType,
    p_ntrp_min: session.ntrpMin,
    p_ntrp_max: session.ntrpMax,
    p_slots_total: session.slotsTotal,
    p_notes: session.notes,
    p_join_mode: session?.joinMode ?? "approval",
  });
}

export function requestToJoinSessionViaRpc(client, sessionId) {
  return callSessionRpc(client, "request_to_join_session", { p_session_id: sessionId });
}

export function reviewJoinRequestViaRpc(client, { sessionId, participantId, decision }) {
  return callSessionRpc(client, "review_join_request", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_decision: decision,
  });
}

export function setPlayerVisibilityViaRpc(client, visible) {
  return callSessionRpc(client, "set_player_visibility", { p_visible: Boolean(visible) });
}

export function inviteViaRpc(client, sessionId, profileId) {
  return callSessionRpc(client, "invite_to_session", {
    p_session_id: sessionId,
    p_profile_id: profileId,
  });
}
