const HOUR_MS = 60 * 60 * 1000;

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Session fixture requires a valid date");
  return date;
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

export function createFutureSessionInput({ now = new Date(), startAt, ...overrides } = {}) {
  const current = asDate(now);
  return {
    courtId: null,
    startAt: startAt ?? new Date(current.getTime() + 24 * HOUR_MS).toISOString(),
    playType: "單打",
    ntrpMin: 3.0,
    ntrpMax: 4.0,
    slotsTotal: 1,
    notes: "session fixture",
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

export function createSessionViaRpc(client, session) {
  return callSessionRpc(client, "create_session", {
    p_court_id: session.courtId,
    p_start_at: session.startAt,
    p_play_type: session.playType,
    p_ntrp_min: session.ntrpMin,
    p_ntrp_max: session.ntrpMax,
    p_slots_total: session.slotsTotal,
    p_notes: session.notes,
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
