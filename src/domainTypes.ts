/** Shared domain and surface shapes produced at the typed data-mapper boundary. */

export type SportCode = "tennis";
export type PlayType = "單打" | "雙打" | "對拉" | "練球";
export type SessionStatus = "open" | "full" | "cancelled" | "played" | "expired";
export type SessionJoinMode = "approval" | "instant";
export type SessionVenueType = "booked" | "walk_on" | "candidates";
export type SessionParticipantRole = "host" | "guest";
export type SessionParticipantStatus = "requested" | "invited" | "accepted" | "declined" | "withdrawn";
export type SessionMessageKind = "user" | "system";
export type ProfileSlotCode = "wd-m" | "wd-a" | "wd-e" | "we-m" | "we-a" | "we-e";

export interface SessionSummary {
  sessionId: number | null;
  sportCode: SportCode;
  courtId: number | null;
  court: string;
  courtDistrict: string;
  courtLat: number | null;
  courtLng: number | null;
  startAt: string;
  playType: PlayType;
  ntrpMin: number | null;
  ntrpMax: number | null;
  slotsTotal: number | null;
  slotsRemaining: number | null;
  notes: string;
  hostNickname: string;
  hostNtrp: number | null;
  hostProfileComplete: boolean;
  status: SessionStatus;
  joinMode: SessionJoinMode;
  venueType: SessionVenueType;
  rangeEnd: string;
  candidateCourtIds: number[];
  feeNote: string;
  decidedAt: string;
}

/** Authenticated session row used by My Sessions and the messages destination. */
export interface MySessionSummary extends Omit<SessionSummary, "candidateCourtIds"> {
  canCancel: boolean;
  canConfirmAttendance: boolean;
  canConfirmPlayed: boolean;
  canRespondInvite: boolean;
  canWithdraw: boolean;
  updatedAt: string;
  viewerRole: SessionParticipantRole;
  viewerParticipantStatus: SessionParticipantStatus;
  viewerPlayedConfirmed: boolean;
  unreadMessageCount: number;
}

/** Minimum court catalogue surface consumed by page-level presentation helpers. */
export interface CourtSummary {
  id: number | string | null;
  name: string;
}

export interface Profile {
  nick: string;
  ntrp: number | null;
  types: Set<PlayType>;
  courts: Set<string>;
  slots: Set<ProfileSlotCode>;
  isPublic: boolean;
  sharePresence: boolean;
  openToGreeting: boolean;
}

export interface SessionJoinPreview {
  sessionId: number | null;
  role: SessionParticipantRole;
  nickname: string;
  ntrp: number | null;
  avatarUrl: string;
  hostedPlayedCount: number;
}

export interface SessionRosterEntry {
  sessionId: number | null;
  participantId: number | null;
  profileId: number | null;
  nickname: string;
  ntrp: number | null;
  playTypes: PlayType[];
  homeCourts: string[];
  role: SessionParticipantRole;
  status: SessionParticipantStatus;
}

export type SessionRoster = SessionRosterEntry[];

export interface ChatMessage {
  messageId: number | null;
  sessionId: number | null;
  senderProfileId: number | null;
  senderNickname: string;
  kind: SessionMessageKind;
  body: string;
  createdAt: string;
  isSelf: boolean;
}

export interface NotificationPreferences {
  chatMessageEnabled: boolean;
  guestInvitedEnabled: boolean;
  guestRequestReviewedEnabled: boolean;
  hostNewRequestEnabled: boolean;
  sessionReminderEnabled: boolean;
  sessionUpdatedEnabled: boolean;
}

export type SurfaceLoadStatus = "idle" | "loading" | "ready" | "error";

export interface SurfaceCloseOptions {
  reason?: string;
  restoreFocus?: boolean;
}

/** Base handle returned by mountSheet/mountDialog. */
export interface SurfaceContract {
  root: HTMLElement;
  surface: HTMLElement;
  close(options?: SurfaceCloseOptions): void;
}

export interface SessionJoinPreviewState {
  participants: SessionJoinPreview[];
  status: Extract<SurfaceLoadStatus, "loading" | "ready" | "error">;
}

/** Extra methods exposed by the session detail surface. */
export interface SessionDetailSurfaceContract extends SurfaceContract {
  enterConfirming(options?: { expectedAccepted?: boolean }): void;
  setJoinPreview(state: SessionJoinPreviewState): void;
}
