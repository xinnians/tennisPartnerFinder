/** Core domain shapes returned by the allowlisted mappers in dataApi.js. */

export interface SessionSummary {
  sessionId: number | null;
  sportCode: string;
  courtId: number | null;
  court: string;
  courtDistrict: string;
  courtLat: number | null;
  courtLng: number | null;
  startAt: string;
  playType: string;
  ntrpMin: number | null;
  ntrpMax: number | null;
  slotsTotal: number | null;
  slotsRemaining: number | null;
  notes: string;
  hostNickname: string;
  hostNtrp: number | null;
  hostProfileComplete: boolean;
  status: string;
  joinMode: string;
  venueType: string;
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
  viewerRole: string;
  viewerParticipantStatus: string;
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
  types: Set<string>;
  courts: Set<string>;
  slots: Set<string>;
  isPublic: boolean;
  sharePresence: boolean;
  openToGreeting: boolean;
}

export interface SessionJoinPreview {
  sessionId: number | null;
  role: string;
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
  playTypes: string[];
  homeCourts: string[];
  role: string;
  status: string;
}

export type SessionRoster = SessionRosterEntry[];

export interface ChatMessage {
  messageId: number | null;
  sessionId: number | null;
  senderProfileId: number | null;
  senderNickname: string;
  kind: string;
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
