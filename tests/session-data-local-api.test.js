import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createDataApi } from "../src/dataApi.js";
import { signUpUser } from "./fixtures/localSupabase.js";

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
      lineId: `host-${runId}`,
      courts: new Set(["青年公園網球場"]),
      types: new Set(["單打"]),
      slots: new Set(["we-m"]),
    });
    await guestApi.saveCurrentProfile({
      nick: "本機球友",
      ntrp: 3.5,
      lineId: `guest-${runId}`,
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
