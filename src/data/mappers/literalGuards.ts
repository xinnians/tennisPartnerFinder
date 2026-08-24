import type {
  PlayType,
  ProfileSlotCode,
  SessionJoinMode,
  SessionMessageKind,
  SessionParticipantRole,
  SessionParticipantStatus,
  SessionStatus,
  SessionVenueType,
  SportCode,
} from "../../domainTypes.ts";

const SPORT_CODES: Record<SportCode, true> = { tennis: true };
const PLAY_TYPES: Record<PlayType, true> = { 單打: true, 雙打: true, 對拉: true, 練球: true };
const SESSION_STATUSES: Record<SessionStatus, true> = {
  open: true,
  full: true,
  cancelled: true,
  played: true,
  expired: true,
};
const SESSION_JOIN_MODES: Record<SessionJoinMode, true> = { approval: true, instant: true };
const SESSION_VENUE_TYPES: Record<SessionVenueType, true> = {
  booked: true,
  walk_on: true,
  candidates: true,
};
const SESSION_PARTICIPANT_ROLES: Record<SessionParticipantRole, true> = { host: true, guest: true };
const SESSION_PARTICIPANT_STATUSES: Record<SessionParticipantStatus, true> = {
  requested: true,
  invited: true,
  accepted: true,
  declined: true,
  withdrawn: true,
};
const SESSION_MESSAGE_KINDS: Record<SessionMessageKind, true> = { user: true, system: true };
const PROFILE_SLOT_CODES: Record<ProfileSlotCode, true> = {
  "wd-m": true,
  "wd-a": true,
  "wd-e": true,
  "we-m": true,
  "we-a": true,
  "we-e": true,
};

function hasOwnLiteral<Value extends string>(values: Readonly<Record<Value, true>>, value: unknown): value is Value {
  return typeof value === "string" && Object.hasOwn(values, value);
}

export function readSportCode(value: unknown): SportCode {
  return hasOwnLiteral(SPORT_CODES, value) ? value : "tennis";
}

export function readPlayType(value: unknown): PlayType {
  return hasOwnLiteral(PLAY_TYPES, value) ? value : "練球";
}

export function readPlayTypes(value: unknown): PlayType[] {
  return Array.isArray(value) ? value.filter((entry): entry is PlayType => hasOwnLiteral(PLAY_TYPES, entry)) : [];
}

export function readSessionStatus(value: unknown): SessionStatus {
  return hasOwnLiteral(SESSION_STATUSES, value) ? value : "expired";
}

export function readSessionJoinMode(value: unknown): SessionJoinMode {
  return hasOwnLiteral(SESSION_JOIN_MODES, value) ? value : "approval";
}

export function readSessionVenueType(value: unknown): SessionVenueType {
  return hasOwnLiteral(SESSION_VENUE_TYPES, value) ? value : "candidates";
}

export function readSessionParticipantRole(value: unknown): SessionParticipantRole {
  return hasOwnLiteral(SESSION_PARTICIPANT_ROLES, value) ? value : "guest";
}

export function readSessionParticipantStatus(value: unknown): SessionParticipantStatus {
  return hasOwnLiteral(SESSION_PARTICIPANT_STATUSES, value) ? value : "withdrawn";
}

export function readSessionMessageKind(value: unknown): SessionMessageKind {
  return hasOwnLiteral(SESSION_MESSAGE_KINDS, value) ? value : "system";
}

export function readProfileSlotCode(value: unknown): ProfileSlotCode | null {
  return hasOwnLiteral(PROFILE_SLOT_CODES, value) ? value : null;
}

export function readProfileSlotCodes(value: unknown): ProfileSlotCode[] {
  if (!Array.isArray(value)) return [];
  return value.map(readProfileSlotCode).filter((entry): entry is ProfileSlotCode => entry != null);
}
