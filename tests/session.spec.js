import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { PENDING_SESSION_INTENT_KEY } from "../src/sessionIntent.js";
import { installFakeMaps, setFakeMapBounds } from "./fixtures/fakeMaps.js";
import { courtIdByName, createProfile, makeClient, setBrowserSession, signUpUser, SUPABASE_URL } from "./fixtures/localSupabase.js";
import {
  callSessionRpc,
  createFutureSessionInput,
  createSessionTestContext,
  createSessionViaRpc,
  inviteViaRpc,
  requestToJoinSessionViaRpc,
  reviewJoinRequestViaRpc,
  setPresenceSharingViaRpc,
  setPlayerVisibilityViaRpc,
  updateMyPresenceViaRpc,
} from "./fixtures/sessionFactory.js";

test.describe.configure({ mode: "serial", timeout: 90_000 });

function captureRuntimeErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function createPublishedSession() {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client: hostClient, session: hostSession } = await signUpUser(context.host.email);
  await createProfile(hostClient, {
    courts: context.host.courts,
    nickname: context.host.nickname,
    ntrp: context.host.ntrp,
    playTypes: context.host.playTypes,
    slots: context.host.slots,
  });
  const courtId = await courtIdByName(hostClient, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(
    hostClient,
    createFutureSessionInput({ courtId, notes: `resume-${context.runId}` })
  );
  return { context, courtId, hostSession, sessionId };
}

async function openPublishedSession(page, sessionId) {
  await page.locator("#nearby-sessions-toggle").click();
  await page.locator(`[data-session-id="${sessionId}"]`).first().click();
  await expect(page.locator("#session-sheet")).toBeVisible();
}

async function gotoWithSession(page, session) {
  await installFakeMaps(page);
  await setBrowserSession(page, session);
  const profileResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/my_profile") && response.request().method() === "GET"
  );
  await page.goto("/");
  await profileResponse;
}

async function switchBrowserSession(page, session) {
  await setBrowserSession(page, session);
  const profileResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/my_profile") && response.request().method() === "GET"
  );
  await page.reload();
  await profileResponse;
}

async function expectChatFeedAtBottom(chat) {
  const metrics = await chat.locator("[data-chat-feed]").evaluate((feed) => ({
    clientHeight: feed.clientHeight,
    scrollHeight: feed.scrollHeight,
    scrollTop: feed.scrollTop,
  }));
  expect(metrics.scrollHeight, "chat history must overflow to exercise the real scroll container").toBeGreaterThan(
    metrics.clientHeight
  );
  expect(
    metrics.scrollTop + metrics.clientHeight,
    `chat feed must end at the latest message: ${JSON.stringify(metrics)}`
  ).toBeGreaterThanOrEqual(metrics.scrollHeight - 1);
  return metrics;
}

async function createCompleteActor(actor) {
  const { client, session } = await signUpUser(actor.email);
  const profileId = await createProfile(client, {
    courts: actor.courts,
    nickname: actor.nickname,
    ntrp: actor.ntrp,
    playTypes: actor.playTypes,
    slots: actor.slots,
  });
  return { client, profileId, session };
}

async function setOpenToGreetingViaRpc(client, enabled) {
  const { data, error } = await client.rpc("set_open_to_greeting", { p_enabled: Boolean(enabled) });
  if (error) throw error;
  return data;
}

async function unusedCourtPair(client) {
  const [{ data: courts, error: courtsError }, { data: sessions, error: sessionsError }] = await Promise.all([
    client.from("courts").select("id,name").eq("city", "台北市").eq("is_active", true).order("id"),
    client.from("session_discovery").select("court_id,candidate_court_ids"),
  ]);
  if (courtsError) throw courtsError;
  if (sessionsError) throw sessionsError;
  const usedIds = new Set(
    (sessions ?? []).flatMap((session) => [session.court_id, ...(session.candidate_court_ids ?? [])]).map(Number)
  );
  const available = (courts ?? []).filter((court) => !usedIds.has(Number(court.id)));
  expect(available.length, "the court scan must find two unused Taipei courts").toBeGreaterThanOrEqual(2);
  return available.slice(0, 2);
}

test("createSessionViaRpc defaults a missing joinMode to approval and preserves instant", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: 123, error: null };
    },
  };
  const session = {
    courtId: 1,
    startAt: "2099-07-18T01:30:00.000Z",
    playType: "單打",
    ntrpMin: 3,
    ntrpMax: 4,
    slotsTotal: 1,
    notes: "direct helper fixture",
  };

  await createSessionViaRpc(client, session);
  await createSessionViaRpc(client, { ...session, joinMode: "instant" });

  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual({
    name: "create_session",
    args: {
      p_candidate_court_ids: null,
      p_court_id: 1,
      p_fee_note: null,
      p_join_mode: "approval",
      p_notes: "direct helper fixture",
      p_ntrp_max: 4,
      p_ntrp_min: 3,
      p_play_type: "單打",
      p_range_end: null,
      p_slots_total: 1,
      p_start_at: "2099-07-18T01:30:00.000Z",
      p_venue_type: "booked",
    },
  });
  expect(calls[1]).toMatchObject({
    name: "create_session",
    args: {
      p_candidate_court_ids: null,
      p_fee_note: null,
      p_join_mode: "instant",
      p_range_end: null,
      p_venue_type: "booked",
    },
  });
});

test("player-directory fixture helpers call the authorized visibility and invitation RPCs", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: "OK", error: null };
    },
  };

  await setPlayerVisibilityViaRpc(client, 1);
  await inviteViaRpc(client, 91, 42);

  expect(calls).toEqual([
    { args: { p_visible: true }, name: "set_player_visibility" },
    { args: { p_profile_id: 42, p_session_id: 91 }, name: "invite_to_session" },
  ]);
});

test("anonymous Join resumes the same live target as a confirmation, never an automatic request", async ({ page }) => {
  const published = await createPublishedSession();
  const { client: guestClient, session: guestSession } = await signUpUser(published.context.guest.email);
  await createProfile(guestClient, {
    courts: published.context.guest.courts,
    nickname: published.context.guest.nickname,
    ntrp: published.context.guest.ntrp,
    playTypes: published.context.guest.playTypes,
    slots: published.context.guest.slots,
  });

  let joinRequests = 0;
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/request_to_join_session`, async (route) => {
    joinRequests += 1;
    await route.continue();
  });
  await installFakeMaps(page);
  await page.goto("/");
  await openPublishedSession(page, published.sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();
  await expect(page.locator("#login-dialog")).toBeVisible();

  await setBrowserSession(page, guestSession);
  await page.reload();
  await expect(page.locator("#join-session-confirmation")).toBeVisible();
  await expect(page.locator("#join-session-confirmation")).toContainText(published.context.host.courts[0]);
  expect(joinRequests).toBe(0);

  await page.keyboard.press("Escape");
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
  await page.reload();
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
});

test("a hash session link survives the login gate and resumes the same live session", async ({ page }) => {
  const published = await createPublishedSession();
  const { client: guestClient, session: guestSession } = await signUpUser(published.context.guest.email);
  await createProfile(guestClient, {
    courts: published.context.guest.courts,
    nickname: published.context.guest.nickname,
    ntrp: published.context.guest.ntrp,
    playTypes: published.context.guest.playTypes,
    slots: published.context.guest.slots,
  });

  await installFakeMaps(page);
  await page.goto(`/#/session/${published.sessionId}`);
  await expect(page.locator("#session-sheet")).toBeVisible();
  await expect(page.locator("#session-sheet")).toContainText(published.context.host.courts[0]);
  await page.locator("#session-sheet [data-session-action='primary']").click();
  await expect(page.locator("#login-dialog")).toBeVisible();

  await setBrowserSession(page, guestSession);
  await page.reload();
  await expect(page.locator("#join-session-confirmation")).toBeVisible();
  await expect(page.locator("#join-session-confirmation")).toContainText(published.context.host.courts[0]);
});

test("an initial signed-out bootstrap clears an old session intent before another account can resume it", async ({ page }) => {
  const published = await createPublishedSession();
  const { client: guestClient, session: guestSession } = await signUpUser(published.context.guest.email);
  await createProfile(guestClient, {
    courts: published.context.guest.courts,
    nickname: published.context.guest.nickname,
    ntrp: published.context.guest.ntrp,
    playTypes: published.context.guest.playTypes,
    slots: published.context.guest.slots,
  });

  await installFakeMaps(page);
  await page.addInitScript(
    ({ key, marker, sessionId }) => {
      if (sessionStorage.getItem(marker)) return;
      sessionStorage.setItem(marker, "1");
      sessionStorage.setItem(key, JSON.stringify({ action: "join", sessionId }));
    },
    { key: PENDING_SESSION_INTENT_KEY, marker: "test:stale-intent-seeded", sessionId: published.sessionId }
  );
  await page.goto("/");
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), PENDING_SESSION_INTENT_KEY)).toBeNull();

  await setBrowserSession(page, guestSession);
  await page.reload();
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
});

test("an incomplete signed-in profile saves atomically and returns to the Join confirmation", async ({ page }) => {
  const published = await createPublishedSession();
  const { session: guestSession } = await signUpUser(published.context.guest.email);

  await gotoWithSession(page, guestSession);
  await openPublishedSession(page, published.sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();

  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await expect(profile).toContainText(`完成後將回到：${published.context.host.courts[0]}・`);
  await profile.getByLabel("公開暱稱").fill(published.context.guest.nickname);
  await profile.getByLabel("常打球場").selectOption(String(published.courtId));
  await profile.getByLabel("單打", { exact: true }).check();
  await profile.getByTestId("profile-save").click();

  await expect(page.locator("#join-session-confirmation")).toBeVisible();
  await expect(page.locator("#join-session-confirmation")).toContainText(published.context.host.courts[0]);
});

test("saving a profile before court options are ready preserves its existing court", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client, session } = await signUpUser(context.guest.email);
  const courtName = context.guest.courts[0];
  const courtId = await courtIdByName(client, courtName);
  await createProfile(client, {
    courts: [courtName],
    nickname: context.guest.nickname,
    ntrp: null,
    playTypes: [],
    slots: [],
  });
  await gotoWithSession(page, session);

  await page.evaluate(
    async ({ nickname, savedCourt }) => {
      const { saveCurrentProfile } = await import("/src/dataApi.js");
      const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
      openProfileCompletionSheet({
        courts: [],
        courtsReady: false,
        onSave: saveCurrentProfile,
        profile: {
          courts: new Set([savedCourt]),
          nick: nickname,
          ntrp: null,
          slots: new Set(),
          types: new Set(),
        },
      });
    },
    { nickname: context.guest.nickname, savedCourt: courtName }
  );

  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await expect(profile).toContainText("正在載入台北市球場");
  await profile.getByTestId("profile-save").click();
  await expect(profile).toBeHidden();

  const { data, error } = await client.from("my_profile").select("court_ids").single();
  if (error) throw error;
  expect(data.court_ids).toEqual([courtId]);
});

test("a stale Join rejection returns keyboard focus from closing surfaces to the nearby drawer", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));

  let invalidated = false;
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/request_to_join_session`, async (route) => {
    if (!invalidated) {
      invalidated = true;
      const { error } = await host.client.rpc("cancel_session", { p_session_id: sessionId });
      if (error) throw error;
    }
    await route.continue();
  });
  await gotoWithSession(page, guest.session);
  await openPublishedSession(page, sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();
  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation).toBeVisible();
  await confirmation.getByTestId("join-session").click();

  await expect(confirmation).toBeHidden();
  await expect(page.locator("#session-sheet")).toBeHidden();
  await expect(page.locator(`[data-session-id="${sessionId}"]`)).toHaveCount(0);
  await expect(page.locator("#nearby-sessions-list")).toBeVisible();
  await expect(page.locator("#nearby-sessions-list [data-nearby-close]")).toBeFocused();
});

test("a stale same-account profile read cannot overwrite a saved profile or its recovered Join confirmation", async ({ page }) => {
  const published = await createPublishedSession();
  const { session: guestSession } = await signUpUser(published.context.guest.email);
  await gotoWithSession(page, guestSession);
  await page.waitForLoadState("networkidle");
  let profileReads = 0;
  let releaseStaleRead;
  let markStaleReadFetched;
  const staleReadFetched = new Promise((resolve) => {
    markStaleReadFetched = resolve;
  });
  const staleReadReleased = new Promise((resolve) => {
    releaseStaleRead = resolve;
  });

  await page.route(`${SUPABASE_URL}/rest/v1/my_profile*`, async (route) => {
    profileReads += 1;
    if (profileReads !== 1) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.body();
    markStaleReadFetched();
    await staleReadReleased;
    await route.fulfill({ body, response });
  });
  await openPublishedSession(page, published.sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();

  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await page.evaluate(async () => {
    const { supabase } = await import("/src/supabaseClient.js");
    const { data } = await supabase.auth.getSession();
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  });
  await staleReadFetched;

  await profile.getByLabel("公開暱稱").fill(published.context.guest.nickname);
  await profile.getByLabel("常打球場").selectOption(String(published.courtId));
  await profile.getByLabel("單打", { exact: true }).check();
  await profile.getByTestId("profile-save").click();
  await expect(page.locator("#join-session-confirmation")).toBeVisible();

  releaseStaleRead();
  await expect(page.locator("#join-session-confirmation")).toBeVisible();
  await expect(profile).toBeHidden();
});

test("a complete profile creates a Taipei session with an explicit Taipei ISO timestamp and focuses its upcoming card", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client, session } = await signUpUser(context.host.email);
  await createProfile(client, {
    courts: context.host.courts,
    nickname: context.host.nickname,
    ntrp: context.host.ntrp,
    playTypes: context.host.playTypes,
    slots: context.host.slots,
  });
  const courtId = await courtIdByName(client, context.host.courts[0]);

  let createPayload = null;
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/create_session`, async (route) => {
    createPayload = route.request().postDataJSON();
    await route.continue();
  });
  await gotoWithSession(page, session);
  await page.getByTestId("create-session-tab").click();
  const form = page.locator("#session-create-modal").getByTestId("session-form");
  await expect(form).toBeVisible();
  await form.getByTestId("session-court").selectOption(String(courtId));
  await form.getByTestId("session-start-at").fill("2099-07-18T09:30");
  await form.getByTestId("session-play-type").selectOption("單打");
  await form.getByTestId("session-slots-1").check();
  await form.getByTestId("session-submit").click();

  await expect(page.locator("#my-sessions-page")).toBeVisible();
  await expect(page.locator("#my-upcoming-sessions [data-session-id]").first()).toBeFocused();
  await expect(page.locator("#my-upcoming-sessions")).toContainText(context.host.courts[0]);
  expect(createPayload?.p_start_at).toBe("2099-07-18T01:30:00.000Z");
});

test("a host creates a candidate session in the form and a guest joins it", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const firstCourtId = await courtIdByName(host.client, "百齡河濱公園網球場");
  const secondCourtId = await courtIdByName(host.client, "青年公園網球場");
  const notes = `candidate-ui-${context.runId}`;
  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const taipeiInput = (date) => new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);

  await gotoWithSession(page, host.session);
  await page.getByTestId("create-session-tab").click();
  const form = page.locator("#session-create-modal").getByTestId("session-form");
  await expect(form).toBeVisible();
  await form.getByTestId("session-venue-candidates").check();
  await form.getByTestId("session-candidate-courts").selectOption([String(firstCourtId), String(secondCourtId)]);
  await form.getByTestId("session-start-at").fill(taipeiInput(start));
  await form.getByTestId("session-range-end").fill(taipeiInput(end));
  await form.getByTestId("session-play-type").selectOption("單打");
  await form.locator("input[name='joinMode'][value='approval']").check();
  await form.locator(".form-optional summary").click();
  await form.getByLabel("費用說明（選填，最多 500 字）").fill("現場均分");
  await form.getByLabel("備註（選填，最多 500 字）").fill(notes);
  await form.getByTestId("session-submit").click();
  await expect(page.locator("#my-sessions-page")).toBeVisible();

  const { data: created, error: createdError } = await host.client
    .from("session_discovery")
    .select("session_id,venue_type,candidate_court_ids,fee_note")
    .eq("notes", notes)
    .maybeSingle();
  if (createdError) throw createdError;
  expect(created).toMatchObject({
    candidate_court_ids: [firstCourtId, secondCourtId],
    fee_note: "現場均分",
    venue_type: "candidates",
  });

  await switchBrowserSession(page, guest.session);
  await page.locator("#nearby-sessions-toggle").click();
  const card = page.locator(`#nearby-sessions-list [data-session-id='${created.session_id}']`).first();
  await expect(card).toContainText("候選局");
  await expect(card).toContainText("青年公園網球場");
  await expect(card).toContainText("百齡河濱公園網球場");
  await card.click();
  const detail = page.locator("#session-sheet");
  await detail.getByRole("button", { name: "申請加入" }).click();
  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation).toContainText("青年公園網球場");
  await expect(confirmation).toContainText("百齡河濱公園網球場");
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation.locator("[data-join-success]")).toBeVisible();

  const { data: participation, error: participationError } = await guest.client
    .from("my_session_participations")
    .select("viewer_participant_status")
    .eq("session_id", created.session_id)
    .maybeSingle();
  if (participationError) throw participationError;
  expect(participation?.viewer_participant_status).toBe("requested");
  expect(runtimeErrors).toEqual([]);
});

test("a host decides a candidate session into one solid pin and the database records decided_at", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const [firstCourt, secondCourt] = await unusedCourtPair(host.client);
  const firstCourtName = firstCourt.name;
  const secondCourtName = secondCourt.name;
  const firstCourtId = firstCourt.id;
  const secondCourtId = secondCourt.id;
  const startAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  startAt.setSeconds(0, 0);
  const rangeEnd = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  const notes = `decision-ui-${context.runId}`;

  await gotoWithSession(page, host.session);
  await page.getByTestId("create-session-tab").click();
  const createForm = page.locator("#session-create-modal").getByTestId("session-form");
  await createForm.getByTestId("session-venue-candidates").check();
  await createForm.getByTestId("session-candidate-courts").selectOption([String(firstCourtId), String(secondCourtId)]);
  await createForm.getByTestId("session-start-at").fill(new Date(startAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await createForm.getByTestId("session-range-end").fill(new Date(rangeEnd.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await createForm.getByTestId("session-play-type").selectOption("單打");
  await createForm.locator(".form-optional summary").click();
  await createForm.getByLabel("備註（選填，最多 500 字）").fill(notes);
  await createForm.getByTestId("session-submit").click();
  await expect(page.locator("#my-sessions-page")).toBeVisible();
  const { data: created, error: createdError } = await host.client
    .from("session_discovery")
    .select("session_id")
    .eq("notes", notes)
    .maybeSingle();
  if (createdError) throw createdError;
  const sessionId = created.session_id;

  await page.getByTestId("map-tab").click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions)).map(({ title }) => title))
    .toEqual(expect.arrayContaining([`球局 · ${firstCourtName} · 未定`, `球局 · ${secondCourtName} · 未定`]));
  await page.getByTestId("my-sessions-tab").click();
  await page.locator(`[data-my-action="decide"][data-session-id="${sessionId}"]`).click();
  const sheet = page.locator("#session-decision-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(firstCourtName);
  await expect(sheet).toContainText(secondCourtName);
  await expect(sheet.getByTestId("session-decision-time")).toHaveValue(
    new Date(startAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  await sheet.getByTestId(`decide-court-${secondCourtId}`).click();
  await expect(sheet).toBeHidden();

  const { data: decided, error: decidedError } = await host.client
    .from("session_discovery")
    .select("court_id,start_at,decided_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (decidedError) throw decidedError;
  expect(decided?.court_id).toBe(secondCourtId);
  expect(new Date(decided?.start_at).toISOString()).toBe(startAt.toISOString());
  expect(decided?.decided_at).not.toBeNull();

  await page.getByTestId("map-tab").click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions)).map(({ title }) => title))
    .toContain(`球局 · ${secondCourtName}`);
  const titles = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions.map(({ title }) => title));
  expect(titles).not.toContain(`球局 · ${firstCourtName} · 未定`);
  expect(titles).not.toContain(`球局 · ${secondCourtName} · 未定`);
  expect(runtimeErrors).toEqual([]);
});

test("a host edits a single-court session and sees authoritative card and detail values", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const [firstCourt, secondCourt] = await unusedCourtPair(host.client);
  const firstCourtName = firstCourt.name;
  const secondCourtName = secondCourt.name;
  const firstCourtId = firstCourt.id;
  const secondCourtId = secondCourt.id;
  const initialStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const updatedStart = new Date(initialStart.getTime() + 90 * 60 * 1000);
  const updatedNotes = `edited-ui-${context.runId}`;
  const sessionId = await createSessionViaRpc(
    host.client,
    createFutureSessionInput({ courtId: firstCourtId, notes: `before-ui-${context.runId}`, startAt: initialStart.toISOString() })
  );

  await gotoWithSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.locator(`[data-my-action="edit"][data-session-id="${sessionId}"]`).click();
  const form = page.locator("#session-edit-sheet").getByTestId("session-edit-form");
  await expect(form).toBeVisible();
  await expect(form.locator('[name="venueType"]')).toHaveCount(0);
  await expect(form.locator('[name="joinMode"]')).toHaveCount(0);
  await form.getByTestId("session-edit-court").selectOption(String(secondCourtId));
  await form.getByTestId("session-edit-start-at").fill(
    new Date(updatedStart.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  await form.getByTestId("session-edit-play-type").selectOption("雙打");
  await expect(form.getByTestId("session-edit-slots-3")).toBeChecked();
  await form.getByTestId("session-edit-slots-2").check();
  // 這局帶入 createFutureSessionInput 預設的 NTRP 3.0–4.0 與既有備註；選填欄位已有值時
  // details 必須預設展開（不可用摺疊藏起既有資料），不需再點 summary。
  await expect(form.locator(".form-optional")).toHaveAttribute("open");
  await expect(form.locator("#session-edit-ntrp-min")).toBeVisible();
  await form.getByLabel("費用說明（選填，最多 500 字）").fill("每人 200");
  await form.getByLabel("備註（選填，最多 500 字）").fill(updatedNotes);
  await form.getByTestId("session-edit-submit").click();
  await expect(page.locator("#session-edit-sheet")).toBeHidden();

  const card = page.locator(`#my-upcoming-sessions [data-open-my-session][data-session-id="${sessionId}"]`).locator("xpath=ancestor::article");
  await expect(card).toContainText(secondCourtName);
  await expect(card).toContainText("缺 2 位");
  await card.locator("[data-open-my-session]").click();
  const detail = page.locator("#session-sheet");
  await expect(detail).toContainText(secondCourtName);
  await expect(detail).toContainText(updatedNotes);
  await expect(detail).toContainText("缺 2 位");
  expect(runtimeErrors).toEqual([]);
});

test("a host creates a now-start direct session in the form, then a guest joins and both can open group chat", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const notes = `now-start-${context.runId}`;

  await gotoWithSession(page, host.session);
  await page.getByTestId("create-session-tab").click();
  const form = page.locator("#session-create-modal").getByTestId("session-form");
  await expect(form).toBeVisible();
  await form.getByTestId("session-court").selectOption(String(courtId));
  await form.getByTestId("session-now-start").click();
  await expect(form.getByTestId("session-start-at")).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  await form.getByTestId("session-play-type").selectOption("單打");
  await form.getByTestId("session-slots-1").check();
  await form.locator("input[name='joinMode'][value='instant']").check();
  await form.locator(".form-optional summary").click();
  await form.getByLabel("備註（選填，最多 500 字）").fill(notes);
  await form.getByTestId("session-submit").click();

  await expect(page.locator("#my-sessions-page")).toBeVisible();
  const { data: created, error: createdError } = await host.client
    .from("session_discovery")
    .select("session_id")
    .eq("notes", notes)
    .maybeSingle();
  if (createdError) throw createdError;
  expect(created?.session_id).toBeTruthy();
  const sessionId = created.session_id;

  await switchBrowserSession(page, guest.session);
  await page.locator("#nearby-sessions-toggle").click();
  const sessionCard = page.locator(`#nearby-sessions-list [data-session-id='${sessionId}']`).first();
  await expect(sessionCard.locator(".session-badge--ongoing")).toHaveText("進行中");
  await expect(sessionCard.locator(".session-badge--instant")).toHaveText("直接加入");
  await sessionCard.click();

  const detail = page.locator("#session-sheet");
  await expect(detail.locator(".session-badge--ongoing")).toHaveText("進行中");
  await detail.getByRole("button", { name: "直接加入" }).click();
  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation).toBeVisible();
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation.locator("[data-join-success]")).toBeVisible();
  await confirmation.getByRole("button", { name: "前往我的球局" }).click();

  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("instant local join accepts immediately and opens group chat without host review", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const observer = await createCompleteActor(context.observer);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(
    host.client,
    createFutureSessionInput({
      courtId,
      joinMode: "instant",
      notes: `instant-${context.runId}`,
      slotsTotal: 2,
    })
  );
  expect(await requestToJoinSessionViaRpc(observer.client, sessionId)).toBe("ACCEPTED");

  await gotoWithSession(page, guest.session);
  await page.locator("#nearby-sessions-toggle").click();
  const sessionCard = page.locator(`#nearby-sessions-list [data-session-id='${sessionId}']`).first();
  await expect(sessionCard.locator(".session-badge--instant")).toHaveText("直接加入");
  await sessionCard.click();

  const detail = page.locator("#session-sheet");
  await expect(detail.locator(".session-badge--instant")).toHaveText("直接加入");
  await detail.getByRole("button", { name: "直接加入" }).click();

  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByTestId("join-session")).toHaveText("直接加入");
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation.locator("[data-join-success]")).toHaveText("已加入球局！前往我的球局開啟群組聊天。");
  await confirmation.getByRole("button", { name: "前往我的球局" }).click();

  const guestUpcoming = page.locator(`#my-upcoming-sessions [data-open-my-session][data-session-id='${sessionId}']`);
  await expect(guestUpcoming).toBeVisible();
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();
  await expect(page.locator("#my-sessions-page")).not.toContainText(context.observer.nickname);

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  await expect(page.getByTestId("participant-row")).toHaveCount(0);
  await expect(page.locator("#my-needs-action")).not.toContainText(context.guest.nickname);
  await expect(page.locator("#my-sessions-badge")).toBeHidden();
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();
  await expect(runtimeErrors).toEqual([]);
});

test("host sees a safe requested roster first, can report it, then accepts and enables group chat", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(
    host.client,
    createFutureSessionInput({ courtId, notes: `mutual-consent-${context.runId}`, slotsTotal: 1 })
  );

  await gotoWithSession(page, guest.session);
  await openPublishedSession(page, sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();
  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation.getByTestId("session-join-form")).toBeVisible();
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation).toContainText("已送出申請，等待主揪回覆。");
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), PENDING_SESSION_INTENT_KEY)).toBeNull();
  await confirmation.getByRole("button", { name: "前往我的球局" }).click();
  await expect(page.locator("#my-sessions-page")).toBeVisible();
  await expect(page.locator("#my-sessions-root [data-my-sessions-heading]")).toBeFocused();
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toHaveCount(0);

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  const participantRow = page.getByTestId("participant-row");
  await expect(participantRow).toBeVisible();
  await expect(page.locator("#my-needs-action")).toContainText(context.guest.nickname);
  await expect(page.locator("#my-sessions-badge")).toHaveText("1");
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();

  const reportRequest = page.waitForRequest((request) => request.url().includes("/rpc/create_report"));
  await page.getByTestId(`report-participant-${guest.profileId}`).click();
  const reportDialog = page.locator("#report-dialog");
  await reportDialog.getByLabel("不當行為").check();
  await reportDialog.getByTestId("report-submit").click();
  const reportPayload = (await reportRequest).postDataJSON();
  expect(reportPayload).toMatchObject({
    p_reason: "不當行為",
    p_reported_profile_id: guest.profileId,
    p_session_id: null,
  });
  await expect(reportDialog).toContainText("已送出檢舉，謝謝你的回報。");
  await reportDialog.getByRole("button", { name: "關閉檢舉" }).click();

  const participantId = await participantRow.getAttribute("data-participant-id");
  await page.getByTestId(`accept-participant-${participantId}`).click();
  await expect(participantRow).toBeHidden();
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();
  await expect(page.locator("#my-sessions-badge")).toBeHidden();

  await switchBrowserSession(page, guest.session);
  await page.getByTestId("my-sessions-tab").click();
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();

  const sessionReportRequest = page.waitForRequest((request) => request.url().includes("/rpc/create_report"));
  await page.getByTestId(`report-session-${sessionId}`).click();
  await expect(page.locator("#report-dialog")).toBeVisible();
  await page.locator("#report-dialog").getByLabel("與實際球局不符").check();
  await page.locator("#report-dialog").getByTestId("report-submit").click();
  expect((await sessionReportRequest).postDataJSON()).toMatchObject({
    p_reason: "與實際球局不符",
    p_reported_profile_id: null,
    p_session_id: sessionId,
  });

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.locator(`#my-upcoming-sessions [data-my-action='cancel'][data-session-id='${sessionId}']`).click();
  await expect(page.locator("#my-history")).toContainText("主揪已取消這一局");
  await expect(page.locator(`#my-history [data-my-action='cancel'][data-session-id='${sessionId}']`)).toHaveCount(0);
});

test("accepting the final vacancy declines the remaining request, and an accepted guest withdrawal reopens the session", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const acceptedGuest = await createCompleteActor(context.guest);
  const declinedGuest = await createCompleteActor(context.observer);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));
  await requestToJoinSessionViaRpc(acceptedGuest.client, sessionId);
  await requestToJoinSessionViaRpc(declinedGuest.client, sessionId);

  await gotoWithSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  const acceptedRow = page.getByTestId("participant-row").filter({ hasText: context.guest.nickname });
  const acceptedParticipantId = await acceptedRow.getAttribute("data-participant-id");
  await page.getByTestId(`accept-participant-${acceptedParticipantId}`).click();
  await expect(page.getByTestId("participant-row")).toHaveCount(0);

  await switchBrowserSession(page, declinedGuest.session);
  await page.getByTestId("my-sessions-tab").click();
  await expect(page.locator("#my-history")).toContainText("已婉拒");
  await expect(page.locator("#my-history")).toContainText("你的加入申請已被婉拒");
  await expect(page.locator("#my-history")).not.toContainText("主揪婉拒");

  await switchBrowserSession(page, acceptedGuest.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.locator(`#my-upcoming-sessions [data-my-action='withdraw'][data-session-id='${sessionId}']`).click();
  await page.getByRole("dialog", { name: "確認退出這一局？" }).getByRole("button", { name: "確認退出" }).click();
  await expect(page.locator("#my-history")).toContainText("你已退出這一局");

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.locator("#my-sessions-refresh").click();
  await expect(page.getByTestId(`report-session-${sessionId}`).locator("xpath=ancestor::article")).toContainText("開放加入");
});

test("two isolated host clients can accept only one final vacancy without exposing a second contact", async () => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const firstGuest = await createCompleteActor(context.guest);
  const secondGuest = await createCompleteActor(context.observer);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));
  await requestToJoinSessionViaRpc(firstGuest.client, sessionId);
  await requestToJoinSessionViaRpc(secondGuest.client, sessionId);

  const { data: requestedRows, error: requestedRowsError } = await host.client
    .from("session_participant_roster")
    .select("participant_id, profile_id, role, status")
    .eq("session_id", sessionId)
    .eq("role", "guest")
    .eq("status", "requested");
  if (requestedRowsError) throw requestedRowsError;
  expect(requestedRows).toHaveLength(2);

  const firstHostClient = makeClient();
  const secondHostClient = makeClient();
  for (const client of [firstHostClient, secondHostClient]) {
    const { error } = await client.auth.setSession({
      access_token: host.session.access_token,
      refresh_token: host.session.refresh_token,
    });
    if (error) throw error;
  }

  const outcomes = await Promise.allSettled(
    requestedRows.map((row, index) =>
      reviewJoinRequestViaRpc(index === 0 ? firstHostClient : secondHostClient, {
        decision: "accepted",
        participantId: row.participant_id,
        sessionId,
      })
    )
  );
  const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
  const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason?.message).toMatch(/ALREADY_DECIDED|SESSION_FULL/);

  const { data: finalRoster, error: finalRosterError } = await host.client
    .from("session_participant_roster")
    .select("participant_id, profile_id, role, status")
    .eq("session_id", sessionId)
    .eq("role", "guest");
  if (finalRosterError) throw finalRosterError;
  const acceptedGuest = finalRoster.find((row) => row.status === "accepted");
  const declinedGuest = finalRoster.find((row) => row.status === "declined");
  expect(acceptedGuest).toBeTruthy();
  expect(declinedGuest).toBeTruthy();
  expect(finalRoster.filter((row) => row.status === "accepted")).toHaveLength(1);

  const { data: hostSession, error: hostSessionError } = await host.client
    .from("my_session_participations")
    .select("status, slots_remaining")
    .eq("session_id", sessionId)
    .single();
  if (hostSessionError) throw hostSessionError;
  expect(hostSession).toEqual({ slots_remaining: 0, status: "full" });

  const { data: hostContacts, error: hostContactsError } = await host.client
    .from("session_contacts")
    .select("counterpart_profile_id")
    .eq("session_id", sessionId);
  if (hostContactsError) throw hostContactsError;
  expect(hostContacts).toEqual([{ counterpart_profile_id: acceptedGuest.profile_id }]);

  const declinedActor = [firstGuest, secondGuest].find((guest) => guest.profileId === declinedGuest.profile_id);
  const { data: declinedContacts, error: declinedContactsError } = await declinedActor.client
    .from("session_contacts")
    .select("counterpart_profile_id")
    .eq("session_id", sessionId);
  if (declinedContactsError) throw declinedContactsError;
  expect(declinedContacts).toEqual([]);
});

test("after a session starts, the host can report it played and an accepted guest can confirm attendance", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const startAt = new Date(Date.now() + 7_000).toISOString();
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, startAt, slotsTotal: 1 }));
  await requestToJoinSessionViaRpc(guest.client, sessionId);
  const { data: roster, error: rosterError } = await host.client
    .from("session_participant_roster")
    .select("participant_id, profile_id")
    .eq("session_id", sessionId)
    .eq("profile_id", guest.profileId)
    .single();
  if (rosterError) throw rosterError;
  await reviewJoinRequestViaRpc(host.client, { decision: "accepted", participantId: roster.participant_id, sessionId });

  await page.waitForTimeout(Math.max(0, new Date(startAt).getTime() - Date.now() + 1_100));
  await gotoWithSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  const playedButton = page.locator(`#my-upcoming-sessions [data-my-action='played'][data-session-id='${sessionId}']`);
  await expect(playedButton).toBeVisible();
  await playedButton.click();
  await expect(page.locator("#my-history")).toContainText("本局已回報打成");

  await switchBrowserSession(page, guest.session);
  await page.getByTestId("my-sessions-tab").click();
  const attendanceButton = page.locator(`#my-history [data-my-action='attendance'][data-session-id='${sessionId}']`);
  await expect(attendanceButton).toBeVisible();
  await attendanceButton.click();
  await expect(page.locator(`#my-history [data-my-action='attendance'][data-session-id='${sessionId}']`)).toHaveCount(0);
});

test("the authenticated Me identity card shows the profile and signing out restores its anonymous prompt", async ({ page }) => {
  const { context, hostSession: initialHostSession, sessionId } = await createPublishedSession();
  const authClient = makeClient();
  const { error: setSessionError } = await authClient.auth.setSession({
    access_token: initialHostSession.access_token,
    refresh_token: initialHostSession.refresh_token,
  });
  if (setSessionError) throw setSessionError;
  const { error: avatarError } = await authClient.auth.updateUser({
    data: { avatar_url: "https://lh3.googleusercontent.com/a/batch-2-me" },
  });
  if (avatarError) throw avatarError;
  const { data: refreshedAuth, error: refreshError } = await authClient.auth.refreshSession();
  if (refreshError) throw refreshError;
  const hostSession = refreshedAuth.session;

  await gotoWithSession(page, hostSession);
  await page.getByTestId("my-sessions-tab").click();
  await expect(page.locator(`#my-upcoming-sessions [data-open-my-session][data-session-id='${sessionId}']`)).toBeVisible();

  await page.getByTestId("me-tab").click();
  const identityCard = page.getByTestId("me-identity-card");
  await expect(identityCard).toContainText(context.host.nickname);
  await expect(identityCard.locator("img")).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/batch-2-me");
  const signOutButton = page.getByTestId("me-sign-out");
  await expect(signOutButton).toBeVisible();
  await signOutButton.click();

  await expect(page.getByTestId("me-sign-in")).toBeVisible();
  await expect(page.getByTestId("me-sign-out")).toHaveCount(0);
  await page.getByTestId("my-sessions-tab").click();
  await expect(page.locator(`#my-upcoming-sessions [data-open-my-session][data-session-id='${sessionId}']`)).toHaveCount(0);
  await expect(page.locator("#toast-root")).toContainText("已登出");
});

test("authenticated players persist the authoritative court subscription set without district migration UI", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const actor = await createCompleteActor(context.host);
  const { data: availableCourts, error: courtError } = await actor.client
    .from("courts")
    .select("id")
    .eq("city", "台北市")
    .eq("is_active", true)
    .order("id")
    .limit(2);
  if (courtError) throw courtError;
  expect(availableCourts).toHaveLength(2);
  const selectedCourtIds = availableCourts.map((court) => court.id);
  await gotoWithSession(page, actor.session);
  await page.getByTestId("me-tab").click();
  const settings = page.locator("#me-root .notification-settings");
  await expect(settings).not.toContainText("行政區");
  // 零訂閱預設收合（新使用者不該一進來就面對 53 座球場），要先展開才選得到。
  await expect(page.locator("#notification-court-picker")).toBeHidden();
  await page.getByTestId("toggle-court-picker").click();
  await expect(page.locator("#notification-court-picker")).toBeVisible();
  // 細選兩座：逐一勾選，驗證非全選路徑也送得出正確的 id。
  for (const courtId of selectedCourtIds) {
    await page.getByTestId(`notification-court-${courtId}`).check();
  }
  await expect(page.locator("#toast-root")).toContainText("球場訂閱已儲存");
  await expect(page.locator("#me-root")).toContainText(`已訂閱 ${selectedCourtIds.length} 座`);

  await expect
    .poll(async () => {
      const { data, error } = await actor.client.from("court_subscriptions").select("court_id").order("court_id");
      if (error) throw error;
      return data.map((row) => row.court_id);
    })
    .toEqual([...selectedCourtIds].sort((left, right) => left - right));
  expect(runtimeErrors).toEqual([]);
});

test("a visible player can be invited from the directory list, join group chat, and delist immediately", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const player = await createCompleteActor(context.guest);
  const host = await createCompleteActor(context.host);
  try {
    const courtId = await courtIdByName(host.client, context.host.courts[0]);
    const sessionId = await createSessionViaRpc(
      host.client,
      createFutureSessionInput({ courtId, notes: `player-invite-${context.runId}`, slotsTotal: 1 })
    );
    expect(await setPlayerVisibilityViaRpc(host.client, true)).toBe("OK");

    await gotoWithSession(page, player.session);
    await page.getByTestId("me-tab").click();
    const playerVisibility = page.getByTestId("player-visibility-toggle");
    await expect(playerVisibility).toHaveAttribute("aria-checked", "false");
    await playerVisibility.click();
    await expect(playerVisibility).toHaveAttribute("aria-checked", "true");

    await switchBrowserSession(page, host.session);
    await page.getByTestId("player-directory-open").click();
    const playerCard = page.getByTestId(`player-directory-row-${player.profileId}`);
    await expect(playerCard).toContainText(context.guest.nickname);
    await playerCard.click();
    await expect(page.locator("#player-card-sheet")).toBeVisible();
    await page.getByTestId("player-invite-session").check();
    await page.getByTestId("player-invite-submit").click();
    await expect(page.getByText("邀請已送出", { exact: true })).toBeVisible();

    await switchBrowserSession(page, player.session);
    await page.getByTestId("my-sessions-tab").click();
    const invite = page.getByTestId("invite-row");
    await expect(invite).toContainText(context.host.nickname);
    // needsActionCount 計入 invite,不只 host-request:受邀者自己沒有任何 host-request,
    // 徽章仍要因這一筆待回覆邀請而顯示。
    await expect(page.locator("#my-sessions-badge")).toHaveText("1");
    await expect(page.getByTestId("my-sessions-tab")).toHaveAttribute("aria-label", "我的球局，1 項待處理");
    await page.getByTestId(`accept-invite-${sessionId}`).click();
    await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();

    await switchBrowserSession(page, host.session);
    await page.getByTestId("my-sessions-tab").click();
    await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();

    await switchBrowserSession(page, player.session);
    await page.getByTestId("me-tab").click();
    await expect(playerVisibility).toHaveAttribute("aria-checked", "true");
    await playerVisibility.click();
    await expect(playerVisibility).toHaveAttribute("aria-checked", "false");
    await expect(playerVisibility).toBeFocused();

    await switchBrowserSession(page, host.session);
    await page.getByTestId("player-directory-open").click();
    await expect(page.getByTestId(`player-directory-row-${player.profileId}`)).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await Promise.allSettled([
      setPlayerVisibilityViaRpc(player.client, false),
      setPlayerVisibilityViaRpc(host.client, false),
    ]);
  }
});

test("nickname-only presence controls open the NTRP profile sheet without writing either setting", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client, session } = await signUpUser(context.host.email);
  await createProfile(client, {
    courts: context.host.courts,
    nickname: context.host.nickname,
    ntrp: null,
    playTypes: [],
    slots: [],
  });
  await gotoWithSession(page, session);
  await page.getByTestId("me-tab").click();

  await page.getByTestId("presence-sharing-toggle").click();
  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await expect(profile).toContainText("要調整在線設定，請填寫公開暱稱與 NTRP（1.0–7.0）。");
  await profile.getByRole("button", { name: "關閉個人檔案" }).click();

  const greeting = page.getByTestId("open-to-greeting-toggle");
  await expect(greeting).not.toBeChecked();
  await greeting.click();
  await expect(profile).toBeVisible();
  await expect(profile).toContainText("要調整在線設定，請填寫公開暱稱與 NTRP（1.0–7.0）。");
  await expect(greeting).not.toBeChecked();

  const { data, error } = await client.from("my_profile").select("share_presence,open_to_greeting").single();
  if (error) throw error;
  expect(data).toEqual({ open_to_greeting: false, share_presence: false });
});

test("saving the profile from a Me gate redraws the live Me identity and settings", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client, session } = await signUpUser(context.host.email);
  await createProfile(client, {
    courts: context.host.courts,
    nickname: context.host.nickname,
    ntrp: null,
    playTypes: [],
    slots: [],
  });
  await gotoWithSession(page, session);
  await page.getByTestId("me-tab").click();

  await page.getByTestId("presence-sharing-toggle").click();
  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await profile.getByLabel(/^NTRP 程度/).fill("3.5");
  await profile.getByTestId("profile-save").click();

  await expect(profile).toHaveCount(0);
  await expect(page.getByTestId("me-identity-card")).toContainText("3.5");
  await expect(page.getByTestId("presence-sharing-toggle")).toHaveAttribute("aria-checked", "false");
  const { data, error } = await client.from("my_profile").select("ntrp,share_presence").single();
  if (error) throw error;
  expect(data).toEqual({ ntrp: 3.5, share_presence: false });
});

test("a nickname-only profile cannot bypass the NTRP gate while turning presence sharing off", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client, session } = await signUpUser(context.host.email);

  try {
    await createProfile(client, {
      courts: context.host.courts,
      nickname: context.host.nickname,
      ntrp: context.host.ntrp,
      playTypes: [],
      slots: [],
    });
    expect(await setPresenceSharingViaRpc(client, true)).toBe("OK");
    await createProfile(client, {
      courts: context.host.courts,
      nickname: context.host.nickname,
      ntrp: null,
      playTypes: [],
      slots: [],
    });

    await gotoWithSession(page, session);
    await page.getByTestId("me-tab").click();
    const sharing = page.getByTestId("presence-sharing-toggle");
    await expect(sharing).toHaveAttribute("aria-checked", "true");
    await sharing.click();

    await expect(page.locator("#profile-completion-sheet")).toBeVisible();
    await expect(sharing).toHaveAttribute("aria-checked", "true");
    const { data, error } = await client.from("my_profile").select("share_presence").single();
    if (error) throw error;
    expect(data.share_presence).toBe(true);
  } finally {
    await createProfile(client, {
      courts: context.host.courts,
      nickname: context.host.nickname,
      ntrp: context.host.ntrp,
      playTypes: [],
      slots: [],
    });
    await setPresenceSharingViaRpc(client, false);
  }
});

test("a nickname-only profile cannot bypass the NTRP gate while turning greeting off", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client, session } = await signUpUser(context.host.email);

  try {
    await createProfile(client, {
      courts: context.host.courts,
      nickname: context.host.nickname,
      ntrp: context.host.ntrp,
      playTypes: [],
      slots: [],
    });
    expect(await setOpenToGreetingViaRpc(client, true)).toBe("OK");
    await createProfile(client, {
      courts: context.host.courts,
      nickname: context.host.nickname,
      ntrp: null,
      playTypes: [],
      slots: [],
    });

    await gotoWithSession(page, session);
    await page.getByTestId("me-tab").click();
    const greeting = page.getByTestId("open-to-greeting-toggle");
    await expect(greeting).toBeChecked();
    await greeting.click();

    await expect(page.locator("#profile-completion-sheet")).toBeVisible();
    await expect(greeting).toBeChecked();
    const { data, error } = await client.from("my_profile").select("open_to_greeting").single();
    if (error) throw error;
    expect(data.open_to_greeting).toBe(true);
  } finally {
    await createProfile(client, {
      courts: context.host.courts,
      nickname: context.host.nickname,
      ntrp: context.host.ntrp,
      playTypes: [],
      slots: [],
    });
    await setOpenToGreetingViaRpc(client, false);
  }
});

test("reciprocal foreground presence shows only to sharing viewers and one-tap hiding removes it immediately", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  let playerA;
  let playerB;
  let playerC;

  try {
    playerA = await createCompleteActor(context.host);
    const playerBAuth = await signUpUser(context.guest.email);
    const playerBProfileId = await createProfile(playerBAuth.client, {
      courts: [],
      nickname: context.guest.nickname,
      ntrp: context.guest.ntrp,
      playTypes: [],
      slots: [],
    });
    playerB = { client: playerBAuth.client, profileId: playerBProfileId, session: playerBAuth.session };
    playerC = await createCompleteActor(context.observer);
    const { data: court, error: courtError } = await playerA.client
      .from("courts")
      .select("id,name,lat,lng")
      .eq("name", context.host.courts[0])
      .single();
    if (courtError) throw courtError;

    await gotoWithSession(page, playerA.session);
    await page.getByTestId("me-tab").click();
    const sharing = page.getByTestId("presence-sharing-toggle");
    await expect(sharing).toHaveAttribute("aria-checked", "false");
    await sharing.click();
    await expect(sharing).toHaveAttribute("aria-checked", "true");
    await expect(sharing).toBeFocused();
    expect(await updateMyPresenceViaRpc(playerA.client, { lat: court.lat, lng: court.lng })).toBe("OK");

    expect(await setPresenceSharingViaRpc(playerB.client, true)).toBe("OK");
    await switchBrowserSession(page, playerB.session);
    await page.getByTestId("player-layer-toggle").click();
    await expect(page.locator("#profile-completion-sheet")).toHaveCount(0);
    const presencePin = page.getByTitle(new RegExp(`^在線 · ${court.name} · \\d+ 人$`));
    await expect(presencePin).toBeVisible();
    await presencePin.click();
    const presenceCard = page.getByTestId(`court-player-card-${playerA.profileId}`);
    await expect(presenceCard).toContainText(context.host.nickname);
    await expect(presenceCard).toContainText("在線・");

    await switchBrowserSession(page, playerC.session);
    await page.getByTestId("player-layer-toggle").click();
    await expect(page.getByTitle(/^在線 · /)).toHaveCount(0);

    await switchBrowserSession(page, playerA.session);
    await page.getByTestId("me-tab").click();
    await expect(sharing).toHaveAttribute("aria-checked", "true");
    await sharing.click();
    await expect(sharing).toHaveAttribute("aria-checked", "false");
    await expect(sharing).toBeFocused();

    await switchBrowserSession(page, playerB.session);
    await page.getByTestId("player-layer-toggle").click();
    const pinsAtCourt = page.getByTitle(new RegExp(`^在線 · ${court.name} · `));
    if (await pinsAtCourt.count()) await pinsAtCourt.first().click();
    await expect(page.getByTestId(`court-player-card-${playerA.profileId}`)).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
  } finally {
    const createdActors = [playerA, playerB, playerC].filter(Boolean);
    await Promise.allSettled(createdActors.flatMap(({ client }) => [
      setPresenceSharingViaRpc(client, false),
      setPlayerVisibilityViaRpc(client, false),
    ]));
  }
});

test("accepted members exchange escaped chat, manage blocks, and retain archived read-only history", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const observer = await createCompleteActor(context.observer);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(
    host.client,
    createFutureSessionInput({ courtId, notes: `chat-${context.runId}`, slotsTotal: 1 })
  );
  await requestToJoinSessionViaRpc(guest.client, sessionId);
  const { data: roster, error: rosterError } = await host.client
    .from("session_participant_roster")
    .select("participant_id,profile_id,role,status")
    .eq("session_id", sessionId);
  if (rosterError) throw rosterError;
  expect(roster.length, "the participant scan must be nonempty").toBeGreaterThan(0);
  const guestRequest = roster.find((row) => Number(row.profile_id) === Number(guest.profileId) && row.status === "requested");
  expect(guestRequest).toBeTruthy();
  await reviewJoinRequestViaRpc(host.client, {
    decision: "accepted",
    participantId: guestRequest.participant_id,
    sessionId,
  });
  const historyBodies = Array.from(
    { length: 3 },
    (_, index) => `歷史訊息 ${index + 1}：請記得帶球拍、水與毛巾，球場見。`
  );
  for (const body of historyBodies) {
    const { error } = await host.client.rpc("post_session_message", {
      p_body: body,
      p_session_id: sessionId,
    });
    if (error) throw error;
  }

  await page.setViewportSize({ width: 1280, height: 1080 });
  await gotoWithSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  // Local 字型已在開啟前完成載入；刻意重現 preview 晚一幀的 sheet reflow，驗證最終排版。
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector("[data-chat-message]")) return;
      observer.disconnect();
      requestAnimationFrame(() => {
        const roster = document.querySelector(".chat-roster");
        if (!roster) return;
        roster.style.paddingBottom = "48px";
        requestAnimationFrame(() => {
          roster.dataset.lateLayoutReady = "true";
        });
      });
    });
    observer.observe(document.getElementById("sheet-root"), { childList: true, subtree: true });
  });
  await page.getByTestId(`open-chat-${sessionId}`).click();
  const chat = page.getByTestId("session-chat-sheet");
  await expect(chat).toBeVisible();
  await expect(chat.locator("[data-chat-roster]")).toContainText(context.host.nickname);
  await expect(chat.locator("[data-chat-roster]")).toContainText(context.guest.nickname);
  await expect(chat.getByText(historyBodies.at(-1), { exact: true })).toBeVisible();
  await expect(chat.locator(".chat-roster")).toHaveAttribute("data-late-layout-ready", "true");
  await expectChatFeedAtBottom(chat);
  const unsafeBody = `球場見 <b>${context.runId}</b> & 喝水`;
  await chat.getByTestId("chat-message-input").fill(unsafeBody);
  await chat.getByTestId("chat-send").click();
  await expect(chat.getByText(unsafeBody)).toBeVisible();
  await expect(chat.locator("b")).toHaveCount(0);
  await expectChatFeedAtBottom(chat);

  await switchBrowserSession(page, guest.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.getByTestId(`open-chat-${sessionId}`).click();
  await expect(chat.getByText(unsafeBody)).toBeVisible();
  await expect(chat.locator("b")).toHaveCount(0);
  await expectChatFeedAtBottom(chat);
  await chat.getByTestId(`block-message-sender-${host.profileId}`).last().click();
  await expect(chat.getByText(unsafeBody)).toHaveCount(0);
  await chat.locator("[data-surface-close]").click();
  // 封鎖清單已搬到「我」頁，解除封鎖要從那裡操作。
  await page.getByTestId("me-tab").click();
  const blockedRow = page.getByTestId(`blocked-player-${host.profileId}`);
  await expect(blockedRow).toContainText(context.host.nickname);
  await blockedRow.getByTestId(`unblock-player-${host.profileId}`).click();
  await expect(blockedRow).toHaveCount(0);

  const { data: observerFeed, error: observerFeedError } = await observer.client
    .from("session_message_feed")
    .select("message_id")
    .eq("session_id", sessionId);
  if (observerFeedError) throw observerFeedError;
  expect(observerFeed).toEqual([]);
  await switchBrowserSession(page, observer.session);
  await page.goto(`/#/session/${sessionId}`);
  await expect(page.locator("#session-sheet")).toBeVisible();
  await expect(page.locator('[data-session-action="chat"]')).toHaveCount(0);
  await page.evaluate(() => window.history.replaceState(null, "", "/"));
  await page.locator("#session-sheet [data-surface-close]").click();

  await switchBrowserSession(page, guest.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.getByTestId(`open-chat-${sessionId}`).click();
  await expect(chat.getByText(unsafeBody)).toBeVisible();
  const { data: cancelled, error: cancelError } = await host.client.rpc("cancel_session", { p_session_id: sessionId });
  if (cancelError) throw cancelError;
  expect(cancelled).toBe("OK");
  await chat.getByTestId("chat-message-input").fill("取消競態後仍嘗試送出");
  await chat.getByTestId("chat-send").click();
  await expect(chat).toContainText("這個球局已封存，無法再傳送訊息。");
  await expect(chat.getByTestId("chat-message-input")).toBeDisabled();
  await expect(chat.getByText(unsafeBody)).toBeVisible();
  await expectChatFeedAtBottom(chat);
  await chat.locator("[data-surface-close]").click();
  await page.getByTestId(`open-chat-${sessionId}`).click();
  await expect(chat.getByTestId("chat-message-input")).toBeDisabled();
  await expect(chat.getByText(unsafeBody)).toBeVisible();
  await expectChatFeedAtBottom(chat);
  expect(runtimeErrors).toEqual([]);
});

test("the Me profile entry edits without a gate and refreshes the identity card in place", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const actor = await createCompleteActor(context.host);

  await gotoWithSession(page, actor.session);
  await page.getByTestId("me-tab").click();

  const identityCard = page.getByTestId("me-identity-card");
  await expect(identityCard).toContainText(context.host.nickname);

  const entry = page.getByTestId("edit-profile");
  await expect(entry).toBeVisible();
  await entry.click();

  const sheet = page.locator("#profile-completion-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".surface__eyebrow")).toHaveText("個人檔案");
  await expect(sheet.locator("h2")).toHaveText("編輯個人檔案");
  await expect(page.getByTestId("profile-save")).toHaveText("儲存");
  await expect(sheet).not.toContainText("完成後將回到");

  const renamed = `${context.host.nickname}B`;
  await sheet.locator("#profile-nickname").fill(renamed);
  await page.getByTestId("profile-save").click();

  await expect(sheet).toHaveCount(0);
  await expect(identityCard).toContainText(renamed);
  // 存檔後連續重繪會讓 generation 守衛擋下中間的還原，焦點由 main.js 的明確托管送回。
  await expect(entry).toBeFocused();

  const { data: savedProfile, error: profileError } = await actor.client
    .from("my_profile")
    .select("nickname")
    .single();
  if (profileError) throw profileError;
  expect(savedProfile.nickname).toBe(renamed);
  expect(runtimeErrors).toEqual([]);
});

test("every Me control keeps focus through a background rerender", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const actor = await createCompleteActor(context.host);
  const { data: court, error: courtError } = await actor.client
    .from("courts")
    .select("lat,lng,name")
    .eq("name", context.host.courts[0])
    .single();
  if (courtError) throw courtError;

  await page.addInitScript(() => {
    const watchers = new Map();
    let nextId = 1;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        clearWatch(id) {
          watchers.delete(id);
        },
        getCurrentPosition() {},
        watchPosition(success) {
          const id = nextId++;
          watchers.set(id, success);
          return id;
        },
      },
    });
    window.__emitPosition = (lat, lng) => {
      for (const success of watchers.values()) success({ coords: { latitude: lat, longitude: lng } });
      return watchers.size;
    };
  });

  await gotoWithSession(page, actor.session);
  await page.getByTestId("me-tab").click();
  // 開啟在線分享才會啟動 presenceTracker，之後才有可控的背景重繪來源。
  const sharing = page.getByTestId("presence-sharing-toggle");
  await sharing.click();
  await expect(sharing).toHaveAttribute("aria-checked", "true");

  // 對稱掃描：不列舉 testid，往後加進「我」頁的控件會自動納入這道守衛。
  const controls = page.locator("#me-root button, #me-root input, #me-root select, #me-root a[href]");
  const total = await controls.count();
  // 組成感知：球場 checkbox 數量會蓋過非球場控件，分開數才抓得到後者整組消失。
  const nonCourtTotal = await page
    .locator("#me-root button, #me-root a[href], #me-root select, #me-root input:not([data-notification-court])")
    .count();
  expect(nonCourtTotal, "非球場控件不得因 selector 寫錯而縮水").toBeGreaterThanOrEqual(15);
  expect(total, "掃描集不得因 selector 寫錯而縮水").toBeGreaterThanOrEqual(nonCourtTotal);

  const landings = [];
  for (let index = 0; index < total; index += 1) {
    const control = controls.nth(index);
    const testId = (await control.getAttribute("data-testid")) ?? (await control.evaluate((node) => node.tagName));
    await control.focus();
    // 盯住目前這個節點：重繪會把它換掉，isConnected 轉 false 就是重繪確實發生的直接證據。
    await control.evaluate((node) => {
      window.__watchedNode = node;
    });
    // 每次挪動座標避開 tracker 的 50 公尺／60 秒節流，確保真的觸發重繪。
    await page.evaluate(([lat, lng]) => window.__emitPosition(lat, lng), [court.lat + index * 0.01, court.lng]);
    await expect
      .poll(async () => await page.evaluate(() => window.__watchedNode?.isConnected === false), {
        message: "背景重繪必須真的發生",
      })
      .toBe(true);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const landedOnBody = await page.evaluate(
      () => document.activeElement === document.body || document.activeElement == null
    );
    landings.push({ landedOnBody, testId });
  }
  const dropped = landings.filter((entry) => entry.landedOnBody);
  expect(dropped, `重繪後焦點掉到 body 的控件：${JSON.stringify(dropped)}`).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("the discovery empty-state subscribe shortcut opens Me and focuses the notification settings heading on real auth", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { session } = await signUpUser(context.host.email);

  await gotoWithSession(page, session);
  await page.locator("#nearby-sessions-toggle").click();
  // 遠離台北市的座標，保證不論其他測試在本機共用 DB 建了多少球局都掃不到。
  await setFakeMapBounds(page, { south: -1, west: -1, north: -0.99, east: -0.99 });
  await expect(page.locator("#discovery-empty")).toBeVisible();
  const subscribeButton = page.locator("#discovery-subscribe");
  await expect(subscribeButton).toBeVisible();

  // showMePage 會同步排 rAF 聚焦一次，接著 fire-and-forget 觸發 reloadCurrentProfile／
  // refreshNotificationSettings，兩者完成後各自呼叫 renderMeDestination background 重繪。
  // 只斷言 toBeFocused() 會在第一次 rAF 就通過（那次本來就沒壞過），測不到批 B-4
  // fix round 1 的 Critical 回歸：焦點被背景重繪吃掉。這裡明確等 notification_prefs
  // 這個背景重繪一定會打的請求完成，再等一輪 rAF 讓對應的 renderMeDestination 真的跑完，
  // 才檢查焦點——這樣才是在「重繪之後」而不是「重繪之前」驗證。
  const notificationPrefsResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/notification_prefs") && response.request().method() === "GET"
  );
  await subscribeButton.click();
  await expect(page.locator("#me-page")).toBeVisible();
  await notificationPrefsResponse;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-notification-settings-heading]")).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("checking the last court collapses the picker without dropping focus to body", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const actor = await createCompleteActor(context.host);
  const { data: taipeiCourts, error: courtsError } = await actor.client
    .from("courts")
    .select("id")
    .eq("city", "台北市")
    .eq("is_active", true)
    .order("id");
  if (courtsError) throw courtsError;
  const courtIds = taipeiCourts.map((row) => row.id);
  expect(courtIds.length).toBeGreaterThan(1);
  const lastCourtId = courtIds.at(-1);
  // 先訂到只差一座，這樣 UI 上勾最後一座就會觸發「全選 → 自動收合」。
  const { error: seedError } = await actor.client.rpc("set_court_subscriptions", {
    p_court_ids: courtIds.slice(0, -1),
  });
  if (seedError) throw seedError;

  await gotoWithSession(page, actor.session);
  await page.getByTestId("me-tab").click();
  const picker = page.locator("#notification-court-picker");
  // 部分訂閱 → 預設展開，正向前提在先。
  await expect(picker).toBeVisible();
  await expect(picker.locator("input[data-notification-court]")).toHaveCount(courtIds.length);

  const lastCourt = page.getByTestId(`notification-court-${lastCourtId}`);
  // 進頁後還有幾波背景重繪，focus 可能被還原邏輯接走；重試到焦點真的停在它身上再按鍵。
  await expect
    .poll(async () => {
      await lastCourt.focus();
      return lastCourt.evaluate((node) => node === document.activeElement);
    })
    .toBe(true);
  await lastCourt.press("Space");

  // 勾滿即收合；剛才那顆 checkbox 隨即隱形，還原目標必須換人。
  await expect(page.getByTestId("subscribe-all-courts")).toBeChecked();
  await expect(picker).toBeHidden();
  await expect(page.locator("#me-root")).toContainText(`已訂閱 ${courtIds.length} 座`);
  expect(
    await page.evaluate(() => document.activeElement === document.body || document.activeElement == null),
    "勾到最後一座後焦點掉到 body"
  ).toBe(false);
  await expect(page.getByTestId("toggle-court-picker")).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("neutral counts stay hidden at zero and appear on all three surfaces once a session is played", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);

  const acceptGuestInto = async (sessionId) => {
    const { data: roster, error } = await host.client
      .from("session_participant_roster")
      .select("participant_id")
      .eq("session_id", sessionId)
      .eq("profile_id", guest.profileId)
      .single();
    if (error) throw error;
    await reviewJoinRequestViaRpc(host.client, { decision: "accepted", participantId: roster.participant_id, sessionId });
  };
  const openPreviewSheet = async (sessionId) => {
    await page.locator("#nearby-sessions-toggle").click();
    await page.locator(`#nearby-sessions-list [data-session-id='${sessionId}']`).first().click();
    await expect(page.locator("#session-sheet")).toBeVisible();
  };

  try {
    const courtId = await courtIdByName(host.client, context.host.courts[0]);
    // 觀察用的未來球局:主揪 + 一位已確認 guest,加入前名單會同時畫出兩列。
    const previewSessionId = await createSessionViaRpc(
      host.client,
      createFutureSessionInput({ courtId, notes: `trust-count-${context.runId}`, slotsTotal: 2 })
    );
    await requestToJoinSessionViaRpc(guest.client, previewSessionId);
    await acceptGuestInto(previewSessionId);
    expect(await setPlayerVisibilityViaRpc(guest.client, true)).toBe("OK");

    // ── 反向前提:三個面在計數為 0 時都不畫這一行 ──────────────────────
    await gotoWithSession(page, guest.session);
    await openPreviewSheet(previewSessionId);
    const preview = page.locator("#session-sheet [data-session-join-preview]");
    // 掃描集非空:兩列真的畫出來了,0 個 .trust-count 才是「沒顯示」而不是「沒資料」。
    await expect(preview.locator("[data-join-preview-person]")).toHaveCount(2);
    await expect(preview.locator(".trust-count")).toHaveCount(0);

    await switchBrowserSession(page, host.session);
    await page.getByTestId("player-directory-open").click();
    const directoryRow = page.getByTestId(`player-directory-row-${guest.profileId}`);
    await expect(directoryRow).toContainText(context.guest.nickname);
    await expect(directoryRow.locator(".trust-count")).toHaveCount(0);
    await directoryRow.click();
    const playerCard = page.locator("#player-card-sheet");
    await expect(playerCard).toBeVisible();
    await expect(playerCard.locator(".trust-count")).toHaveCount(0);

    // ── 讓兩個計數各自 +1:主揪回報打成、guest 確認到場 ─────────────────
    // 開始時間放在 1 分鐘前(create_session 容許 5 分鐘內),不必等待就能回報打成。
    const playedSessionId = await createSessionViaRpc(
      host.client,
      createFutureSessionInput({
        courtId,
        notes: `trust-count-played-${context.runId}`,
        slotsTotal: 1,
        startAt: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    await requestToJoinSessionViaRpc(guest.client, playedSessionId);
    await acceptGuestInto(playedSessionId);
    expect(await callSessionRpc(host.client, "mark_session_played", { p_session_id: playedSessionId })).toBe("OK");
    expect(await callSessionRpc(guest.client, "confirm_session_attendance", { p_session_id: playedSessionId })).toBe("OK");

    // ── 正向前提:同樣三個面現在各顯示一則中性事實 ────────────────────
    await switchBrowserSession(page, host.session);
    await page.getByTestId("player-directory-open").click();
    await expect(directoryRow.locator(".trust-count")).toHaveText("已打 1 場");
    await directoryRow.click();
    await expect(playerCard).toBeVisible();
    await expect(playerCard.locator(".trust-count")).toHaveText("已打 1 場");

    await switchBrowserSession(page, guest.session);
    await openPreviewSheet(previewSessionId);
    await expect(preview.locator("[data-join-preview-person]")).toHaveCount(2);
    // 只有主揪那一列有計數;guest 沒開過局,所以整份名單只有一個 .trust-count。
    await expect(preview.locator(".trust-count")).toHaveCount(1);
    await expect(preview.locator("[data-join-preview-person]").first().locator(".trust-count")).toHaveText("已成局 1 次");
    expect(runtimeErrors).toEqual([]);
  } finally {
    await Promise.allSettled([setPlayerVisibilityViaRpc(guest.client, false)]);
  }
});
