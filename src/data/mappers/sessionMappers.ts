import type { Database } from "../databaseTypes.ts";
import type {
  ChatMessage,
  MySessionSummary,
  PlayType,
  SessionJoinPreview,
  SessionMessageKind,
  SessionParticipantRole,
  SessionParticipantStatus,
  SessionRosterEntry,
  SessionSummary,
} from "../../domainTypes.ts";
import { asArray, asBoolean, asNumber, asText } from "./valueMappers.ts";

type PublicViews = Database["public"]["Views"];
type SessionDiscoveryRow = Partial<PublicViews["session_discovery"]["Row"]>;
type MySessionRow = Partial<PublicViews["my_session_participations"]["Row"]>;
type SessionSummaryRow = SessionDiscoveryRow & MySessionRow;
type SessionRosterRow = Partial<PublicViews["session_participant_roster"]["Row"]>;
type SessionJoinPreviewRow = Partial<PublicViews["session_join_preview"]["Row"]>;
type SessionMessageRow = Partial<PublicViews["session_message_feed"]["Row"]>;
type MockRow = Record<string, unknown>;

function sessionSummaryValues(row: SessionSummaryRow = {}): SessionSummary {
  return {
    sessionId: asNumber(row.session_id),
    sportCode: asText(row.sport_code) as SessionSummary["sportCode"],
    courtId: asNumber(row.court_id),
    court: asText(row.court),
    courtDistrict: asText(row.court_district),
    courtLat: asNumber(row.court_lat),
    courtLng: asNumber(row.court_lng),
    startAt: asText(row.start_at),
    playType: asText(row.play_type) as PlayType,
    ntrpMin: asNumber(row.ntrp_min),
    ntrpMax: asNumber(row.ntrp_max),
    slotsTotal: asNumber(row.slots_total),
    slotsRemaining: asNumber(row.slots_remaining),
    notes: asText(row.notes),
    hostNickname: asText(row.host_nickname),
    hostNtrp: asNumber(row.host_ntrp),
    hostProfileComplete: asBoolean(row.host_profile_complete),
    status: asText(row.status) as SessionSummary["status"],
    joinMode: asText(row.join_mode) as SessionSummary["joinMode"],
    venueType: asText(row.venue_type) as SessionSummary["venueType"],
    rangeEnd: asText(row.range_end),
    candidateCourtIds: asArray(row.candidate_court_ids)
      .map(asNumber)
      .filter((courtId): courtId is number => courtId != null),
    feeNote: asText(row.fee_note),
    decidedAt: asText(row.decided_at),
  };
}

/** Public-only mapper: every output field is intentionally named here. */
export function mapSessionSummary(row: SessionSummaryRow): SessionSummary {
  return sessionSummaryValues(row);
}

export function mapMockSessionSummary(session: MockRow = {}): SessionSummary {
  return {
    sessionId: asNumber(session.sessionId),
    sportCode: asText(session.sportCode) as SessionSummary["sportCode"],
    courtId: asNumber(session.courtId),
    court: asText(session.court),
    courtDistrict: asText(session.courtDistrict),
    courtLat: asNumber(session.courtLat),
    courtLng: asNumber(session.courtLng),
    startAt: asText(session.startAt),
    playType: asText(session.playType) as PlayType,
    ntrpMin: asNumber(session.ntrpMin),
    ntrpMax: asNumber(session.ntrpMax),
    slotsTotal: asNumber(session.slotsTotal),
    slotsRemaining: asNumber(session.slotsRemaining),
    notes: asText(session.notes),
    hostNickname: asText(session.hostNickname),
    hostNtrp: asNumber(session.hostNtrp),
    hostProfileComplete: asBoolean(session.hostProfileComplete),
    status: asText(session.status) as SessionSummary["status"],
    joinMode: asText(session.joinMode) as SessionSummary["joinMode"],
    venueType: asText(session.venueType, "booked") as SessionSummary["venueType"],
    rangeEnd: asText(session.rangeEnd),
    candidateCourtIds: asArray(session.candidateCourtIds)
      .map(asNumber)
      .filter((courtId): courtId is number => courtId != null),
    feeNote: asText(session.feeNote),
    decidedAt: asText(session.decidedAt),
  };
}

/** Authenticated history mapper, still without contact/profile identifiers. */
export function mapMySession(row: MySessionRow = {}): MySessionSummary {
  const session = sessionSummaryValues(row);
  return {
    sessionId: session.sessionId,
    sportCode: session.sportCode,
    courtId: session.courtId,
    court: session.court,
    courtDistrict: session.courtDistrict,
    courtLat: session.courtLat,
    courtLng: session.courtLng,
    startAt: session.startAt,
    playType: session.playType,
    ntrpMin: session.ntrpMin,
    ntrpMax: session.ntrpMax,
    slotsTotal: session.slotsTotal,
    slotsRemaining: session.slotsRemaining,
    notes: session.notes,
    hostNickname: session.hostNickname,
    hostNtrp: session.hostNtrp,
    hostProfileComplete: session.hostProfileComplete,
    status: session.status,
    joinMode: session.joinMode,
    venueType: session.venueType,
    rangeEnd: session.rangeEnd,
    decidedAt: asText(row.decided_at),
    feeNote: asText(row.fee_note),
    viewerRole: asText(row.viewer_role) as SessionParticipantRole,
    viewerParticipantStatus: asText(row.viewer_participant_status) as SessionParticipantStatus,
    viewerPlayedConfirmed: asBoolean(row.viewer_played_confirmed),
    updatedAt: asText(row.updated_at),
    canCancel: asBoolean(row.can_cancel),
    canWithdraw: asBoolean(row.can_withdraw),
    canConfirmPlayed: asBoolean(row.can_confirm_played),
    canConfirmAttendance: asBoolean(row.can_confirm_attendance),
    canRespondInvite: asBoolean(row.can_respond_invite),
    // 未讀數是 UI 判斷（>0 顯示徽章/圓點）的輸入，不可為 null——asNumber 對缺欄位回傳
    // null，這裡明確補一個預設 0，別的欄位允許 null 但這個不行。
    unreadMessageCount: asNumber(row.unread_message_count) ?? 0,
  };
}

/** Private roster mapper. It is never used for public discovery UI. */
export function mapSessionRosterRow(row: SessionRosterRow = {}): SessionRosterEntry {
  return {
    sessionId: asNumber(row.session_id),
    participantId: asNumber(row.participant_id),
    profileId: asNumber(row.profile_id),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    playTypes: asArray(row.play_types).filter((value) => typeof value === "string") as PlayType[],
    homeCourts: asArray(row.home_courts).filter((value): value is string => typeof value === "string"),
    role: asText(row.role) as SessionParticipantRole,
    status: asText(row.status) as SessionParticipantStatus,
  };
}

/** Authenticated pre-join mapper: no participant or profile identity crosses this boundary. */
export function mapSessionJoinPreviewRow(row: SessionJoinPreviewRow = {}): SessionJoinPreview {
  return {
    sessionId: asNumber(row.session_id),
    role: asText(row.role) as SessionParticipantRole,
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    avatarUrl: asText(row.avatar_url),
    hostedPlayedCount: Number(row.hosted_played_count ?? 0),
  };
}

export function mapMockSessionJoinPreviewRow(row: MockRow = {}): SessionJoinPreview {
  return {
    sessionId: asNumber(row.sessionId),
    role: asText(row.role) as SessionParticipantRole,
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    avatarUrl: asText(row.avatarUrl),
    hostedPlayedCount: Number(row.hostedPlayedCount ?? 0),
  };
}

/** Authenticated chat-feed mapper: every output field is intentionally named here. */
export function mapSessionMessageRow(row: SessionMessageRow = {}): ChatMessage {
  return {
    messageId: asNumber(row.message_id),
    sessionId: asNumber(row.session_id),
    senderProfileId: asNumber(row.sender_profile_id),
    senderNickname: asText(row.sender_nickname),
    kind: asText(row.kind) as SessionMessageKind,
    body: asText(row.body),
    createdAt: asText(row.created_at),
    isSelf: asBoolean(row.is_self),
  };
}
