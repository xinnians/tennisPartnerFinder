import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createDataApi } from "../src/dataApi.js";
import { makeAdminClient, makeClient, signUpUser } from "./fixtures/localSupabase.js";

const runLocalApiTest = process.env.RUN_LOCAL_SUPABASE_API_TEST === "1";
const publicKeys = [
  "sessionId",
  "sportCode",
  "courtId",
  "court",
  "courtDistrict",
  "courtLat",
  "courtLng",
  "startAt",
  "playType",
  "ntrpMin",
  "ntrpMax",
  "slotsTotal",
  "slotsRemaining",
  "notes",
  "hostNickname",
  "hostNtrp",
  "hostProfileComplete",
  "status",
  "joinMode",
  "venueType",
  "rangeEnd",
  "candidateCourtIds",
  "feeNote",
  "decidedAt",
].sort();

test(
  "loopback fixture exercises profile RPC, discovery allowlist, and lifecycle outcome",
  { skip: !runLocalApiTest },
  async () => {
    const runId = randomUUID();
    const { client: hostClient } = await signUpUser(`session-host-${runId}@example.test`);
    const { client: guestClient } = await signUpUser(`session-guest-${runId}@example.test`);
    const hostApi = createDataApi({ configured: true, client: hostClient });
    const guestApi = createDataApi({ configured: true, client: guestClient });

    const hostProfile = await hostApi.saveCurrentProfile({
      nick: "本機主揪",
      ntrp: 3.5,
      courts: new Set(["青年公園網球場"]),
      types: new Set(["單打"]),
      slots: new Set(["we-m"]),
    });
    await guestApi.saveCurrentProfile({
      nick: "本機球友",
      ntrp: 3.5,
      courts: new Set(["青年公園網球場"]),
      types: new Set(["單打"]),
      slots: new Set(["we-m"]),
    });

    assert.equal(hostProfile.nick, "本機主揪");
    assert.equal("share" in hostProfile, false);
    assert.equal("id" in hostProfile, false);

    const courts = await hostApi.loadCourts();
    const court = courts.find((item) => item.name === "青年公園網球場");
    assert.ok(court?.id);
    const startAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { sessionId } = await hostApi.createSession({
      courtId: court.id,
      playType: "單打",
      startAt,
      ntrpMin: 3,
      ntrpMax: 4,
      slotsTotal: 1,
      notes: "local fixture session",
      joinMode: "approval",
    });
    assert.ok(sessionId);

    const discovery = await guestApi.loadSessionDiscovery({
      bounds: { south: 24.95, west: 121.43, north: 25.18, east: 121.67 },
      startAfter: new Date(Date.now() - 60_000).toISOString(),
      startBefore: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const summary = discovery.find((item) => item.sessionId === sessionId);
    assert.ok(summary);
    assert.deepEqual(Object.keys(summary).sort(), publicKeys);
    assert.equal("lineId" in summary, false);
    assert.equal("profileId" in summary, false);

    assert.deepEqual(await guestApi.requestToJoinSession(sessionId), {
      outcome: "OK",
      accepted: false,
      reloadRequired: false,
    });
  }
);

test(
  "third authenticated account sees only host and accepted guest in the live join preview",
  { skip: !runLocalApiTest },
  async () => {
    const runId = randomUUID();
    const { client: hostClient, session: hostSession } = await signUpUser(`preview-host-${runId}@example.test`);
    const { client: guestClient, session: guestSession } = await signUpUser(`preview-guest-${runId}@example.test`);
    const { client: viewerClient } = await signUpUser(`preview-viewer-${runId}@example.test`);
    const adminClient = makeAdminClient();
    const hostApi = createDataApi({ configured: true, client: hostClient });
    const guestApi = createDataApi({ configured: true, client: guestClient });
    const viewerApi = createDataApi({ configured: true, client: viewerClient });

    const { error: hostMetadataError } = await adminClient.auth.admin.updateUserById(hostSession.user.id, {
      user_metadata: { avatar_url: "https://lh3.googleusercontent.com/a/local-stage-t45-host" },
    });
    if (hostMetadataError) throw hostMetadataError;
    const { error: guestMetadataError } = await adminClient.auth.admin.updateUserById(guestSession.user.id, {
      user_metadata: { avatar_url: "https://evil.example/local-stage-t45.png" },
    });
    if (guestMetadataError) throw guestMetadataError;

    await hostApi.saveCurrentProfile({ nick: "本機預覽主揪", ntrp: 3.5 });
    await guestApi.saveCurrentProfile({ nick: "本機已確認球友", ntrp: 3.5 });
    await viewerApi.saveCurrentProfile({ nick: "本機申請中旁觀者", ntrp: null });

    const court = (await hostApi.loadCourts()).find((item) => item.name === "青年公園網球場");
    assert.ok(court?.id);
    const { sessionId } = await hostApi.createSession({
      courtId: court.id,
      joinMode: "approval",
      playType: "雙打",
      startAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      slotsTotal: 3,
    });

    assert.equal((await guestApi.requestToJoinSession(sessionId)).outcome, "OK");
    const requestedGuest = (await hostApi.loadSessionRoster(sessionId)).find(
      (participant) => participant.nickname === "本機已確認球友" && participant.status === "requested"
    );
    assert.ok(requestedGuest?.participantId);
    await hostApi.acceptSessionParticipant(sessionId, requestedGuest.participantId);
    assert.equal((await viewerApi.requestToJoinSession(sessionId)).outcome, "OK");

    const preview = await viewerApi.loadSessionJoinPreview(sessionId);
    assert.equal(preview.length, 2, "the live preview scan must be nonempty and accepted-only");
    assert.deepEqual(
      preview.find((participant) => participant.role === "host"),
      {
        avatarUrl: "https://lh3.googleusercontent.com/a/local-stage-t45-host",
        hostedPlayedCount: 0,
        nickname: "本機預覽主揪",
        ntrp: 3.5,
        role: "host",
        sessionId,
      }
    );
    assert.deepEqual(
      preview.find((participant) => participant.role === "guest"),
      { avatarUrl: "", hostedPlayedCount: 0, nickname: "本機已確認球友", ntrp: 3.5, role: "guest", sessionId }
    );
    assert.equal(
      preview.some((participant) => participant.nickname === "本機申請中旁觀者"),
      false
    );

    const anonClient = makeClient();
    const { data: anonRows, error: anonError } = await anonClient
      .from("session_join_preview")
      .select("session_id,role,nickname,ntrp,avatar_url")
      .eq("session_id", sessionId);
    assert.equal(anonRows, null);
    assert.equal(anonError?.code, "42501");
  }
);
