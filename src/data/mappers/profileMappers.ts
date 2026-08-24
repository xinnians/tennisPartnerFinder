import type { Database } from "../databaseTypes.ts";
import type { CourtSummary, NotificationPreferences, PlayType, Profile, ProfileSlotCode } from "../../domainTypes.ts";
import { readPlayTypes, readProfileSlotCodes } from "./literalGuards.ts";
import { asArray, asBoolean, asNumber, asText } from "./valueMappers.ts";

type PublicSchema = Database["public"];
type NotificationPreferencesRow = Partial<PublicSchema["Tables"]["notification_prefs"]["Row"]>;
type MyPlayerBlockRow = Partial<PublicSchema["Views"]["my_player_blocks"]["Row"]>;
type PlayerDirectoryRow = Partial<PublicSchema["Views"]["player_directory"]["Row"]>;
type PlayerPresenceDirectoryRow = Partial<PublicSchema["Views"]["player_presence_directory"]["Row"]>;
type CurrentProfileRow = Partial<PublicSchema["Views"]["my_profile"]["Row"]>;
type CourtRow = Partial<PublicSchema["Tables"]["courts"]["Row"]>;

export interface MyPlayerBlock {
  blockedNickname: string;
  blockedProfileId: number | null;
  createdAt: string;
}

export interface PlayerDirectoryEntry {
  courtDistrict: string;
  courtId: number | null;
  courtLat: number | null;
  courtLng: number | null;
  courtName: string;
  isSelf: boolean;
  nickname: string;
  ntrp: number | null;
  playedCount: number;
  playTypes: PlayType[];
  profileId: number | null;
  slotCodes: ProfileSlotCode[];
}

export interface PlayerPresenceDirectoryEntry {
  courtDistrict: string;
  courtId: number | null;
  courtLat: number | null;
  courtLng: number | null;
  courtName: string;
  isSelf: boolean;
  minutesAgo: number | null;
  nickname: string;
  ntrp: number | null;
  openToGreeting: boolean;
  profileId: number | null;
}

export interface DataCourt extends CourtSummary {
  city: string;
  district: string;
  lat: number | null;
  lng: number | null;
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    chatMessageEnabled: true,
    guestInvitedEnabled: true,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: true,
    sessionReminderEnabled: true,
    sessionUpdatedEnabled: true,
  };
}

export function mapNotificationPreferences(row: NotificationPreferencesRow = {}): NotificationPreferences {
  return {
    chatMessageEnabled: row.chat_message_enabled !== false,
    hostNewRequestEnabled: row.host_new_request_enabled !== false,
    guestRequestReviewedEnabled: row.guest_request_reviewed_enabled !== false,
    guestInvitedEnabled: row.guest_invited_enabled !== false,
    sessionReminderEnabled: row.session_reminder_enabled !== false,
    sessionUpdatedEnabled: row.session_updated_enabled !== false,
  };
}

/** Authenticated block-list mapper: only the blocked profile's safe display fields are exposed. */
export function mapMyPlayerBlockRow(row: MyPlayerBlockRow = {}): MyPlayerBlock {
  return {
    blockedProfileId: asNumber(row.blocked_profile_id),
    blockedNickname: asText(row.blocked_nickname),
    createdAt: asText(row.created_at),
  };
}

/** Public player-directory mapper: every output field is intentionally named here. */
export function mapPlayerDirectoryRow(row: PlayerDirectoryRow = {}): PlayerDirectoryEntry {
  return {
    profileId: asNumber(row.profile_id),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    playTypes: readPlayTypes(row.play_types),
    slotCodes: readProfileSlotCodes(row.slot_codes),
    courtId: asNumber(row.court_id),
    courtName: asText(row.court_name),
    courtDistrict: asText(row.court_district),
    courtLat: asNumber(row.court_lat),
    courtLng: asNumber(row.court_lng),
    isSelf: asBoolean(row.is_self),
    playedCount: Number(row.played_count ?? 0),
  };
}

/** Local-demo directory mapper: camelCase input, identical guarded domain output. */
export function mapMockPlayerDirectoryRow(row: Record<string, unknown> = {}): PlayerDirectoryEntry {
  return {
    profileId: asNumber(row.profileId),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    playTypes: readPlayTypes(row.playTypes),
    slotCodes: readProfileSlotCodes(row.slotCodes),
    courtId: asNumber(row.courtId),
    courtName: asText(row.courtName),
    courtDistrict: asText(row.courtDistrict),
    courtLat: asNumber(row.courtLat),
    courtLng: asNumber(row.courtLng),
    isSelf: asBoolean(row.isSelf),
    playedCount: asNumber(row.playedCount) ?? 0,
  };
}

/** Presence view mapper: its source is reciprocal-only and excludes contacts. */
export function mapPlayerPresenceDirectoryRow(row: PlayerPresenceDirectoryRow = {}): PlayerPresenceDirectoryEntry {
  return {
    profileId: asNumber(row.profile_id),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    openToGreeting: asBoolean(row.open_to_greeting),
    courtId: asNumber(row.court_id),
    courtName: asText(row.court_name),
    courtDistrict: asText(row.court_district),
    courtLat: asNumber(row.court_lat),
    courtLng: asNumber(row.court_lng),
    minutesAgo: asNumber(row.minutes_ago),
    isSelf: asBoolean(row.is_self),
  };
}

/** Local-demo presence mapper: camelCase input, identical reciprocal-domain output. */
export function mapMockPlayerPresenceDirectoryRow(row: Record<string, unknown> = {}): PlayerPresenceDirectoryEntry {
  return {
    profileId: asNumber(row.profileId),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    openToGreeting: asBoolean(row.openToGreeting),
    courtId: asNumber(row.courtId),
    courtName: asText(row.courtName),
    courtDistrict: asText(row.courtDistrict),
    courtLat: asNumber(row.courtLat),
    courtLng: asNumber(row.courtLng),
    minutesAgo: asNumber(row.minutesAgo),
    isSelf: asBoolean(row.isSelf),
  };
}

export function mapCourt(row: CourtRow = {}): DataCourt {
  return {
    id: asNumber(row.id),
    name: asText(row.name),
    city: asText(row.city),
    district: asText(row.district),
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
  };
}

export function mapCurrentProfile(row: CurrentProfileRow = {}, courts: CourtSummary[] = []): Profile {
  const courtNamesById = new Map(courts.map((court) => [String(court.id), court.name]));
  const selectedCourts = asArray(row.court_ids)
    .map((courtId) => courtNamesById.get(String(courtId)))
    .filter((name): name is string => typeof name === "string");

  return {
    nick: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    types: new Set(readPlayTypes(row.play_types)),
    courts: new Set(selectedCourts),
    slots: new Set(readProfileSlotCodes(row.slot_codes)),
    isPublic: asBoolean(row.is_public),
    sharePresence: asBoolean(row.share_presence),
    openToGreeting: asBoolean(row.open_to_greeting),
  };
}
