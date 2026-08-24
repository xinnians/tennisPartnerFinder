import {
  profileGateForIntent,
  profileMeetsGate,
  profileReadiness,
  sessionIdentity,
} from "../features/profile-auth/profileAuthFeature.ts";

import type {
  ControllerAuthSession,
  ControllerEventName,
  ControllerPendingIntent,
  ControllerProfileEligibility,
  ControllerRequestGate,
  SessionControllerState,
} from "../controllerContracts.ts";
import type { Profile, SurfaceCloseOptions } from "../domainTypes.ts";
import type { Store } from "../sessionStore.ts";
import type { SurfaceRegistry } from "./surfaceRegistry.ts";

export interface AuthIdentityChange {
  accountChanged: boolean;
  identity: string | null;
  previousIdentity: string | null;
  session: ControllerAuthSession | null;
  signedOut: boolean;
}

export type AuthIdentityChangeHandler = (change: AuthIdentityChange) => ControllerProfileEligibility | null | undefined;

interface AuthControllerDependencies {
  blockedPlayerGate: ControllerRequestGate;
  clearIntent(): boolean;
  clearPlayerDirectory(options?: { closeReason?: string }): void;
  clearPlayerLayer(options?: { closeReason?: string }): void;
  isCurrentAuthSnapshot(snapshot: { epoch: number; identity: string | null }): boolean;
  notifyMySessions(): void;
  onAuthIdentityChange?: AuthIdentityChangeHandler | null;
  publish(): void;
  reconcileActiveChatParticipation(): void;
  reconcileActiveDetailParticipation(): void;
  reloadParticipation(epoch: number, identity: string | null): Promise<boolean>;
  replaceMySessions(sessions: unknown): void;
  resumePendingIntent(): Promise<boolean>;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  transitionSurfaces(name: string, options?: SurfaceCloseOptions): void;
}

interface IdentityDecision extends AuthIdentityChange {
  identityChanged: boolean;
}

const GATE_LEVELS = ["nickname", "ntrp", "directory"] as const;

/** Owns auth identity classification and controller-side auth reconciliation. */
export function createAuthController({
  blockedPlayerGate,
  clearIntent,
  clearPlayerDirectory,
  clearPlayerLayer,
  isCurrentAuthSnapshot,
  notifyMySessions,
  onAuthIdentityChange = null,
  publish,
  reconcileActiveChatParticipation,
  reconcileActiveDetailParticipation,
  reloadParticipation,
  replaceMySessions,
  resumePendingIntent,
  store,
  surfaceRegistry,
  transitionSurfaces,
}: AuthControllerDependencies): {
  setAuthSession(session: ControllerAuthSession | null): void;
  setAuthState(session: ControllerAuthSession | null, profile?: ControllerProfileEligibility | null): Promise<void>;
  setProfile(profile: Partial<Profile> | null): void;
} {
  const read = store.getState;

  function classifyIdentity(session: ControllerAuthSession | null): IdentityDecision {
    const identity = sessionIdentity(session);
    const previousIdentity = sessionIdentity(read().authSession);
    return {
      accountChanged: Boolean(previousIdentity) && Boolean(identity) && previousIdentity !== identity,
      identity,
      identityChanged: previousIdentity !== identity,
      previousIdentity,
      session,
      signedOut: Boolean(previousIdentity) && !identity,
    };
  }

  function setProfile(profile: Partial<Profile> | null): void {
    store.setState({ profile: profile ?? null });
    store.emit("me");
  }

  async function applyAuthState(
    session: ControllerAuthSession | null,
    profile: ControllerProfileEligibility | null,
    decision: IdentityDecision
  ): Promise<void> {
    const { accountChanged, identity, identityChanged, signedOut } = decision;
    const previousGates = Object.fromEntries(
      GATE_LEVELS.map((level) => [level, profileMeetsGate(read().profileEligibility, level)])
    ) as Record<(typeof GATE_LEVELS)[number], boolean>;
    const nextGates = Object.fromEntries(
      GATE_LEVELS.map((level) => [level, profileMeetsGate(profile, level)])
    ) as Record<(typeof GATE_LEVELS)[number], boolean>;
    const previousReadiness = profileReadiness(read().profileEligibility);
    const nextReadiness = profileReadiness(profile);
    const gatesChanged = GATE_LEVELS.some((level) => previousGates[level] !== nextGates[level]);
    const nicknameWasLost = previousGates.nickname && !nextGates.nickname;
    const ntrpWasLost = previousGates.ntrp && !nextGates.ntrp;
    const directoryWasLost = previousGates.directory && !nextGates.directory;
    const readinessChanged =
      previousReadiness.state !== nextReadiness.state || previousReadiness.source !== nextReadiness.source;
    if (identityChanged || gatesChanged || readinessChanged) store.setState({ authEpoch: read().authEpoch + 1 });
    const epoch = read().authEpoch;

    if (signedOut || accountChanged) clearIntent();
    if (signedOut || accountChanged || ntrpWasLost) {
      clearPlayerLayer({ closeReason: signedOut || accountChanged ? "account-change" : "ntrp-gate-lost" });
    }
    if (signedOut || accountChanged || ntrpWasLost || directoryWasLost) {
      clearPlayerDirectory({ closeReason: signedOut || accountChanged ? "account-change" : "directory-gate-lost" });
    }
    if (identityChanged) {
      transitionSurfaces("authIdentityChanged", { reason: "account-change", restoreFocus: false });
    } else {
      if (ntrpWasLost) {
        transitionSurfaces("authNtrpLost", { reason: "ntrp-gate-lost", restoreFocus: false });
      }
      if (nicknameWasLost) {
        transitionSurfaces("authNicknameLost", { reason: "nickname-gate-lost", restoreFocus: false });
      }
      const promptIntent = surfaceRegistry.meta("profilePrompt", "intent") as ControllerPendingIntent | null;
      const promptGate = profileGateForIntent(promptIntent);
      if (surfaceRegistry.get("profilePrompt") && promptGate && !previousGates[promptGate] && nextGates[promptGate]) {
        transitionSurfaces("authProfileResolved", { reason: "profile-gate-resolved", restoreFocus: false });
      }
    }

    store.setState({ authSession: session ?? null, profileEligibility: profile ?? null });
    store.emit("me");
    if (identityChanged) {
      replaceMySessions([]);
      blockedPlayerGate.invalidate();
      store.setState({
        blockedPlayers: [],
        blockedPlayersError: "",
        blockedPlayersStatus: "idle",
        mySessionsError: "",
        mySessionsStatus: identity ? "loading" : "idle",
      });
      notifyMySessions();
    }
    reconcileActiveDetailParticipation();
    reconcileActiveChatParticipation();
    publish();
    if (await reloadParticipation(epoch, identity)) publish();
    if (epoch === read().authEpoch && isCurrentAuthSnapshot({ epoch, identity })) await resumePendingIntent();
  }

  function setAuthState(
    session: ControllerAuthSession | null,
    profile: ControllerProfileEligibility | null = null
  ): Promise<void> {
    return applyAuthState(session, profile, classifyIdentity(session));
  }

  function setAuthSession(session: ControllerAuthSession | null): void {
    const decision = classifyIdentity(session);
    if (decision.identityChanged && onAuthIdentityChange) {
      const profile = onAuthIdentityChange(decision) ?? null;
      void applyAuthState(session, profile, decision);
      return;
    }
    store.setState({ authSession: session ?? null });
    store.emit("me");
  }

  return { setAuthSession, setAuthState, setProfile };
}
