import type { ControllerAuthSession } from "../../controllerContracts.ts";
import type { AuthVerificationResult } from "../../data/authApi.ts";
import { sessionIdentity, validAuthSession } from "./profileAuthFeature.ts";

interface AuthCandidateOptions {
  forcePublic?: boolean;
  reconcilePageOwner?: boolean;
}

interface AuthEventRecord {
  candidate: ControllerAuthSession | null;
  event: string;
  revision: number;
  session: ControllerAuthSession | null;
}

interface SessionProof {
  accessToken: string;
  identity: string;
}

export interface VerifiedAuthProof {
  readonly accessToken: string;
  readonly authUserId: string;
  readonly revision: number;
}

export interface AuthVerificationAuthority {
  isVerificationRevisionCurrent(revision: number): boolean;
  isVerifiedAuthProofCurrent(proof: VerifiedAuthProof): boolean;
  notifyUnauthorized(input: { authUserId: string; revision: number }): Promise<void>;
  readCurrentVerifiedAuthProof(): VerifiedAuthProof | null;
  readVerifiedAuthProof(input: { authUserId: string; revision: number }): VerifiedAuthProof | null;
}

export interface AuthRefreshCoordinatorDependencies {
  applyCandidate(candidate: ControllerAuthSession | null, options?: AuthCandidateOptions): Promise<void>;
  onConfirmedAnonymous(): void;
  onSignedOut(): void;
  onVerificationFailure?(failure: AuthVerificationFailureNotice): void;
  onVerified(): void;
  schedule(task: () => void): void;
  verifyCurrentSession(): Promise<AuthVerificationResult>;
}

export interface AuthVerificationFailureNotice {
  kind: "rejected" | "superseded" | "unavailable";
  priorVerifiedAuthUserId?: string;
  revision: number;
}

export interface AuthRefreshCoordinator extends AuthVerificationAuthority {
  retryIfNeeded(): Promise<void>;
  recordAuthEvent(session: ControllerAuthSession | null | undefined, event: string): void;
  restore(): Promise<void>;
  retry(): Promise<void>;
}

function defaultSchedule(task: () => void): void {
  // A real task boundary is intentional. auth-js awaits every subscriber;
  // starting refresh from that callback (including a queued microtask) can
  // re-enter the refresh that is waiting for the callback to finish.
  globalThis.setTimeout(task, 0);
}

function sessionProof(session: unknown): SessionProof | null {
  const candidate = session as ControllerAuthSession | null | undefined;
  const identity = sessionIdentity(candidate);
  const accessToken = candidate?.access_token;
  return identity && typeof accessToken === "string" && accessToken.trim().length > 0
    ? { accessToken, identity }
    : null;
}

function proofFrom(value: unknown): SessionProof | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "identity" in value &&
    "accessToken" in value &&
    typeof value.identity === "string" &&
    typeof value.accessToken === "string"
  ) {
    return { accessToken: value.accessToken, identity: value.identity };
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "authUserId" in value &&
    "accessToken" in value &&
    typeof value.authUserId === "string" &&
    typeof value.accessToken === "string"
  ) {
    return { accessToken: value.accessToken, identity: value.authUserId };
  }
  return sessionProof(value);
}

function sameProof(left: unknown, right: unknown): boolean {
  const leftProof = proofFrom(left);
  const rightProof = proofFrom(right);
  return Boolean(
    leftProof &&
    rightProof &&
    leftProof.identity === rightProof.identity &&
    leftProof.accessToken === rightProof.accessToken
  );
}

export function createAuthRefreshCoordinator({
  applyCandidate,
  onConfirmedAnonymous,
  onSignedOut,
  onVerificationFailure = () => undefined,
  onVerified,
  schedule = defaultSchedule,
  verifyCurrentSession,
}: Omit<AuthRefreshCoordinatorDependencies, "schedule"> &
  Partial<Pick<AuthRefreshCoordinatorDependencies, "schedule">>): AuthRefreshCoordinator {
  let booting = true;
  let expectedIdentity: string | null = null;
  let handledSignedOutRevision = 0;
  let lastSignedOutRevision = 0;
  let latest: AuthEventRecord | null = null;
  let lastVerifiedIdentity: string | null = null;
  let pendingPublish: { promise: Promise<boolean>; proof: SessionProof } | null = null;
  let publishedProof: VerifiedAuthProof | null = null;
  let retryRequired = false;
  let revision = 0;
  let verificationPromise: Promise<void> | null = null;

  function isLatest(record: AuthEventRecord): boolean {
    return latest?.revision === record.revision;
  }

  function handleSignedOutOnce(record: AuthEventRecord): void {
    if (record.event !== "SIGNED_OUT" || handledSignedOutRevision >= record.revision) return;
    handledSignedOutRevision = record.revision;
    onSignedOut();
  }

  function publishVerificationFailure(kind: AuthVerificationFailureNotice["kind"], failureRevision: number): void {
    const notice: AuthVerificationFailureNotice = lastVerifiedIdentity
      ? { kind, priorVerifiedAuthUserId: lastVerifiedIdentity, revision: failureRevision }
      : { kind, revision: failureRevision };
    try {
      onVerificationFailure(Object.freeze(notice));
    } catch {
      // A dormant observer cannot change Auth fail-closed behavior.
    }
  }

  async function failClosed(
    candidate: ControllerAuthSession | null,
    forcePublic = true,
    reconcilePageOwner = true
  ): Promise<void> {
    publishedProof = null;
    await applyCandidate(candidate, { forcePublic, reconcilePageOwner });
  }

  function proofMatchesExpected(session: ControllerAuthSession, attemptRevision: number): boolean {
    const identity = sessionIdentity(session);
    if (!identity) return false;
    if (expectedIdentity && expectedIdentity !== identity) return false;
    return lastSignedOutRevision <= attemptRevision || expectedIdentity === identity;
  }

  async function publishVerified(
    session: ControllerAuthSession,
    acceptedRevision: number,
    reconcilePageOwner: boolean
  ): Promise<boolean> {
    const proof = sessionProof(session);
    if (!proof) {
      // profileAuthFeature deliberately needs only user.id for controller
      // ownership. This stricter refresh gate must not pass a proof-invalid
      // event to that sink, or a missing access token would still look valid.
      await failClosed(null);
      return false;
    }
    if (publishedProof && sameProof(publishedProof, proof)) {
      if (acceptedRevision === revision && proofMatchesExpected(session, acceptedRevision)) {
        publishedProof = Object.freeze({
          accessToken: proof.accessToken,
          authUserId: proof.identity,
          revision: acceptedRevision,
        });
      }
      return true;
    }
    if (pendingPublish && sameProof(pendingPublish.proof, proof)) {
      return pendingPublish.promise;
    }

    const running = (async () => {
      await applyCandidate(session, { reconcilePageOwner });
      let publishedRevision = acceptedRevision;
      if (latest && latest.revision !== acceptedRevision) {
        const duplicateFreshEvent =
          latest.event === "TOKEN_REFRESHED" &&
          latest.session &&
          sameProof(latest.session, proof) &&
          proofMatchesExpected(latest.session, acceptedRevision);
        if (!duplicateFreshEvent) return false;
        publishedRevision = latest.revision;
      }

      publishedProof = Object.freeze({
        accessToken: proof.accessToken,
        authUserId: proof.identity,
        revision: publishedRevision,
      });
      lastVerifiedIdentity = proof.identity;
      expectedIdentity = proof.identity;
      onVerified();
      return true;
    })();
    const pending = { promise: running, proof };
    pendingPublish = pending;
    try {
      return await running;
    } finally {
      if (pendingPublish === pending) pendingPublish = null;
    }
  }

  async function settleSignedOut(record: AuthEventRecord): Promise<void> {
    handleSignedOutOnce(record);
    await failClosed(null);
  }

  async function verifyUntilStable(reconcilePageOwner: boolean): Promise<void> {
    let retriedSupersededRevision: number | null = null;
    while (true) {
      const attemptRevision = revision;
      let result: AuthVerificationResult;
      try {
        result = await verifyCurrentSession();
      } catch (error) {
        result = { error, kind: "unavailable", session: null };
      }

      const current = latest;
      if (current && current.revision > attemptRevision) {
        if (current.event === "SIGNED_OUT") {
          await settleSignedOut(current);
          return;
        }
        if (!current.session) {
          await failClosed(current.candidate);
          return;
        }
        if (current.event === "TOKEN_REFRESHED") {
          const matchesReturnedSession = result.kind === "verified" && sameProof(current.session, result.session);
          const isExpectedServerEvent = proofMatchesExpected(current.session, attemptRevision);
          if (matchesReturnedSession && isExpectedServerEvent) {
            if (await publishVerified(current.session, current.revision, reconcilePageOwner)) return;
          }
        }
        // A newer unverified account event superseded this attempt. Re-read
        // and refresh that current account; the loop is event-driven and has
        // no guessed retry count.
        continue;
      }

      if (result.kind === "verified") {
        const verified = validAuthSession(result.session as ControllerAuthSession | null);
        const proofEvent = latest;
        if (
          verified &&
          proofEvent?.event === "TOKEN_REFRESHED" &&
          proofEvent.revision > attemptRevision &&
          sameProof(proofEvent.session, verified) &&
          proofMatchesExpected(verified, attemptRevision)
        ) {
          if (await publishVerified(verified, proofEvent.revision, reconcilePageOwner)) return;
          continue;
        }
        // The installed auth client emits TOKEN_REFRESHED before a successful
        // refresh returns. Missing correlation is not enough evidence to open
        // private state.
        await failClosed(null);
        return;
      }

      if (result.kind === "anonymous") {
        retryRequired = false;
        if (current?.event === "SIGNED_OUT") {
          await settleSignedOut(current);
          return;
        }
        if (current?.session || current?.candidate) {
          await failClosed(current.candidate && !current.session ? current.candidate : null);
          return;
        }
        if (reconcilePageOwner) onConfirmedAnonymous();
        lastVerifiedIdentity = null;
        await failClosed(null, false);
        return;
      }

      if (result.kind === "superseded") {
        await failClosed(null);
        if (retriedSupersededRevision !== attemptRevision) {
          // A discarded refresh means auth storage changed while it was in
          // flight. Re-read once immediately at the same stable revision. A
          // second discard waits for a new auth event or explicit retry, so a
          // noisy client cannot create a local busy loop.
          retriedSupersededRevision = attemptRevision;
          continue;
        }
        retryRequired = true;
        if (revision === attemptRevision) publishVerificationFailure("superseded", attemptRevision);
        return;
      }

      // Rejected and unavailable results stay local-public. Only a later auth
      // event or explicit retry can start another verification.
      await failClosed(null);
      if (revision === attemptRevision) publishVerificationFailure(result.kind, attemptRevision);
      retryRequired = result.kind === "unavailable";
      return;
    }
  }

  function requestVerification(reconcilePageOwner: boolean): Promise<void> {
    if (verificationPromise) return verificationPromise;
    retryRequired = false;
    const running = verifyUntilStable(reconcilePageOwner).finally(() => {
      if (verificationPromise === running) verificationPromise = null;
    });
    verificationPromise = running;
    return running;
  }

  async function handleRecordedEvent(record: AuthEventRecord): Promise<void> {
    if (record.event === "SIGNED_OUT") {
      handleSignedOutOnce(record);
      if (!isLatest(record)) return;
      await failClosed(null, !booting, !booting);
      return;
    }

    if (!isLatest(record)) return;

    if (!record.session) {
      await failClosed(record.candidate);
      return;
    }

    if (record.event !== "TOKEN_REFRESHED") {
      // Cached SIGNED_IN/USER_UPDATED/etc. are not authorization evidence.
      // A byte-for-byte proof already published by this coordinator does not
      // reopen anything, so it may stay visible while the event is checked.
      // A different identity or token is still closed before verification.
      const repeatsPublishedProof = Boolean(publishedProof && sameProof(record.session, publishedProof));
      if (!repeatsPublishedProof) await failClosed(null, !booting, !booting);
      if (isLatest(record) && !booting) await requestVerification(false);
      return;
    }

    if (!isLatest(record) || booting || verificationPromise) return;
    const proof = sessionProof(record.session);
    const trustedIdentity = publishedProof?.authUserId;
    if (proof && trustedIdentity && trustedIdentity === proof.identity) {
      await publishVerified(record.session, record.revision, false);
      return;
    }
    await failClosed(null);
    if (proof && isLatest(record) && !booting && (lastSignedOutRevision === 0 || expectedIdentity === proof.identity)) {
      await requestVerification(false);
    }
  }

  function recordAuthEvent(candidate: ControllerAuthSession | null | undefined, event: string): void {
    if (event === "INITIAL_SESSION") return;

    const typedCandidate = candidate ?? null;
    const session = validAuthSession(typedCandidate);
    const record = { candidate: typedCandidate, event, revision: ++revision, session };
    latest = record;

    if (event === "SIGNED_OUT") {
      lastSignedOutRevision = record.revision;
      expectedIdentity = null;
      lastVerifiedIdentity = null;
      publishedProof = null;
      retryRequired = false;
    } else if (event !== "TOKEN_REFRESHED") {
      expectedIdentity = sessionIdentity(session);
      if (!publishedProof || !sameProof(session, publishedProof)) publishedProof = null;
    } else if (!session) {
      publishedProof = null;
    }

    // The subscriber itself only records state and schedules a later task.
    schedule(() => {
      void handleRecordedEvent(record).catch(() => {});
    });
  }

  function isVerificationRevisionCurrent(candidateRevision: number): boolean {
    return Number.isSafeInteger(candidateRevision) && candidateRevision >= 0 && candidateRevision === revision;
  }

  function isVerifiedAuthProofCurrent(candidate: VerifiedAuthProof): boolean {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const keys = Reflect.ownKeys(candidate);
    if (
      keys.length !== 3 ||
      !keys.includes("accessToken") ||
      !keys.includes("authUserId") ||
      !keys.includes("revision") ||
      typeof candidate.accessToken !== "string" ||
      candidate.accessToken.trim().length === 0 ||
      typeof candidate.authUserId !== "string" ||
      candidate.authUserId.trim().length === 0 ||
      !isVerificationRevisionCurrent(candidate.revision)
    ) {
      return false;
    }
    return Boolean(
      publishedProof &&
      publishedProof.revision === revision &&
      publishedProof.authUserId === candidate.authUserId &&
      publishedProof.accessToken === candidate.accessToken
    );
  }

  function readCurrentVerifiedAuthProof(): VerifiedAuthProof | null {
    return publishedProof && publishedProof.revision === revision ? Object.freeze({ ...publishedProof }) : null;
  }

  function readVerifiedAuthProof(input: { authUserId: string; revision: number }): VerifiedAuthProof | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== 2 ||
      !keys.includes("authUserId") ||
      !keys.includes("revision") ||
      typeof input.authUserId !== "string" ||
      !isVerificationRevisionCurrent(input.revision) ||
      !publishedProof ||
      publishedProof.revision !== input.revision ||
      publishedProof.authUserId !== input.authUserId
    ) {
      return null;
    }
    return Object.freeze({ ...publishedProof });
  }

  async function retry(): Promise<void> {
    await failClosed(null);
    await requestVerification(false);
  }

  async function notifyUnauthorized(input: { authUserId: string; revision: number }): Promise<void> {
    const proof = readVerifiedAuthProof(input);
    if (!proof) return;
    await retry();
  }

  return {
    isVerificationRevisionCurrent,
    isVerifiedAuthProofCurrent,
    notifyUnauthorized,
    readCurrentVerifiedAuthProof,
    readVerifiedAuthProof,
    recordAuthEvent,
    async restore() {
      try {
        await requestVerification(true);
      } finally {
        booting = false;
      }
    },
    retry,
    async retryIfNeeded() {
      // An online event can arrive while the boot request is still settling.
      // Wait for that request before reading retryRequired so the event is not
      // lost when the in-flight request subsequently reports unavailable.
      const activeVerification = verificationPromise;
      if (activeVerification) await activeVerification;
      if (!retryRequired) return;
      await failClosed(null);
      await requestVerification(false);
    },
  };
}
