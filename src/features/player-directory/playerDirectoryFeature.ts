import type { ControllerPlayer, ControllerPlayerGroup } from "../../controllerContracts.ts";
import type { MySessionSummary } from "../../domainTypes.ts";
import type { PlayerDirectoryEntry, PlayerPresenceDirectoryEntry } from "../../data/mappers/profileMappers.ts";
import { compareSessionStart, timeValue } from "../session-lifecycle/sessionLifecycleFeature.ts";

const NOW_START_JOIN_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface PlayerDirectoryPresentation extends PlayerDirectoryEntry {
  courtDistricts: string[];
  courtNames: string[];
  isPresent: boolean;
  minutesAgo: number | null;
  openToGreeting: boolean;
}

interface PlayerDirectoryAggregate extends PlayerDirectoryEntry {
  courtDistricts: string[];
  courtNames: string[];
}

export function groupPlayersByCourt(players: readonly ControllerPlayer[]): ControllerPlayerGroup[] {
  const groups = new Map<string, ControllerPlayerGroup>();
  for (const player of players) {
    const key = String(player?.courtId ?? "");
    if (!key) continue;
    const group = groups.get(key) ?? {
      court: {
        id: player.courtId,
        name: player.courtName,
        district: player.courtDistrict,
        lat: Number(player.courtLat),
        lng: Number(player.courtLng),
      },
      players: [],
      presenceCount: 0,
    };
    group.players.push(player);
    if (player.isPresent) group.presenceCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function playerDirectoryRows(
  directoryRows: readonly PlayerDirectoryEntry[] | null | undefined,
  presenceRows: readonly PlayerPresenceDirectoryEntry[] | null | undefined
): PlayerDirectoryPresentation[] {
  const safePresenceRows: readonly PlayerPresenceDirectoryEntry[] = Array.isArray(presenceRows) ? presenceRows : [];
  const presenceByProfileId = new Map(safePresenceRows.map((player) => [String(player?.profileId), player]));
  const profiles = new Map<string, PlayerDirectoryAggregate>();
  const safeDirectoryRows: readonly PlayerDirectoryEntry[] = Array.isArray(directoryRows) ? directoryRows : [];
  for (const row of safeDirectoryRows) {
    const key = String(row?.profileId ?? "");
    if (!key) continue;
    const existing = profiles.get(key);
    if (!existing) {
      profiles.set(key, {
        ...row,
        courtDistricts: row?.courtDistrict ? [row.courtDistrict] : [],
        courtNames: row?.courtName ? [row.courtName] : [],
      });
      continue;
    }
    if (row?.courtName && !existing.courtNames.includes(row.courtName)) existing.courtNames.push(row.courtName);
    if (row?.courtDistrict && !existing.courtDistricts.includes(row.courtDistrict)) {
      existing.courtDistricts.push(row.courtDistrict);
    }
  }
  return [...profiles.values()]
    .map((player) => {
      const presence = presenceByProfileId.get(String(player.profileId));
      const courtNames = [...player.courtNames];
      const courtDistricts = [...player.courtDistricts];
      return {
        ...player,
        courtDistrict: courtDistricts.join("、"),
        courtDistricts,
        courtName: courtNames.join("、"),
        courtNames,
        isPresent: Boolean(presence),
        minutesAgo: presence?.minutesAgo ?? null,
        openToGreeting: presence?.openToGreeting === true,
      };
    })
    .sort(
      (left, right) =>
        Number(right.isPresent) - Number(left.isPresent) ||
        String(left.nickname ?? "").localeCompare(String(right.nickname ?? ""), "zh-Hant")
    );
}

export function selectInvitableSessions(sessions: readonly MySessionSummary[], now = Date.now()): MySessionSummary[] {
  return sessions
    .filter(
      (session) =>
        String(session?.viewerRole).toLowerCase() === "host" &&
        String(session?.status).toLowerCase() === "open" &&
        timeValue(session?.startAt, Number.NEGATIVE_INFINITY) > now - NOW_START_JOIN_WINDOW_MS
    )
    .sort(compareSessionStart);
}
