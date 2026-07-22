import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { expectWithinViewport, installFakeMaps } from "./fixtures/fakeMaps.js";
import { courtIdByName, createProfile, setBrowserSession, signUpUser, SUPABASE_URL } from "./fixtures/localSupabase.js";
import {
  createFutureSessionInput,
  createSessionTestContext,
  createSessionViaRpc,
  inviteViaRpc,
  reviewJoinRequestViaRpc,
  setPlayerVisibilityViaRpc,
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

async function createCompleteActor(actor) {
  const { client, session } = await signUpUser(actor.email);
  const profileId = await createProfile(client, {
    courts: actor.courts,
    lineId: actor.lineId,
    nickname: actor.nickname,
    ntrp: actor.ntrp,
    playTypes: actor.playTypes,
    slots: actor.slots,
  });
  return { client, profileId, session };
}

async function switchBrowserSession(page, session) {
  await setBrowserSession(page, session);
  const profileResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/my_profile") && response.request().method() === "GET"
  );
  await page.reload();
  await profileResponse;
}

test("a 390px user can expand discovery, resume join, and reach action-first My Sessions without overflow", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));

  let joinRequests = 0;
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/request_to_join_session`, async (route) => {
    joinRequests += 1;
    await route.continue();
  });
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").focus();
  await page.keyboard.press("Enter");
  const drawer = page.locator("#nearby-sessions-list");
  await expect(drawer).toBeVisible();
  await expectWithinViewport(page, drawer);
  const sessionCard = page.locator(`[data-session-id='${sessionId}']`).first();
  await sessionCard.focus();
  await page.keyboard.press("Enter");
  const sheet = page.locator("#session-sheet");
  await expect(sheet).toBeVisible();
  await expectWithinViewport(page, sheet);
  await sheet.locator("[data-session-action='primary']").click();
  await expect(page.locator("#login-dialog")).toBeVisible();
  await expectWithinViewport(page, page.locator("#login-dialog"));

  await switchBrowserSession(page, guest.session);
  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByTestId("session-join-form")).toBeVisible();
  await expectWithinViewport(page, confirmation);
  expect(joinRequests).toBe(0);
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation).toContainText("已送出申請，等待主揪回覆。");
  await confirmation.getByRole("button", { name: "關閉確認" }).click();

  const mySessionsTab = page.getByTestId("my-sessions-tab");
  await mySessionsTab.focus();
  await page.keyboard.press("Enter");
  const waitingCard = page.locator(`#my-needs-action [data-guest-request-session='${sessionId}']`);
  await expect(waitingCard).toBeVisible();
  await expect(waitingCard).toContainText("等待主揪回覆");
  await expectWithinViewport(page, waitingCard);

  const { data: roster, error: rosterError } = await host.client
    .from("session_participant_roster")
    .select("participant_id, profile_id")
    .eq("session_id", sessionId)
    .eq("profile_id", guest.profileId)
    .single();
  if (rosterError) throw rosterError;
  await reviewJoinRequestViaRpc(host.client, { decision: "accepted", participantId: roster.participant_id, sessionId });

  await switchBrowserSession(page, guest.session);
  await mySessionsTab.focus();
  await page.keyboard.press("Enter");
  const upcomingCard = page.getByTestId(`report-session-${sessionId}`).locator("xpath=ancestor::article");
  await expect(upcomingCard).toBeVisible();
  await expect(upcomingCard).toContainText("已核准加入");
  await expect(page.getByTestId(`session-contact-${host.profileId}`)).toBeVisible();
  const settledUpcomingCard = page.getByTestId(`report-session-${sessionId}`).locator("xpath=ancestor::article");
  await settledUpcomingCard.scrollIntoViewIfNeeded();
  await expectWithinViewport(page, settledUpcomingCard);
  await expect(page.getByTestId("my-sessions-tab")).toBeFocused();
});

test("a 390px invited player can accept the invite card and read the host LINE contact", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const player = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));
  expect(await setPlayerVisibilityViaRpc(player.client, true)).toBe("OK");
  expect(await inviteViaRpc(host.client, sessionId, player.profileId)).toBe("OK");

  await installFakeMaps(page);
  await setBrowserSession(page, player.session);
  await page.goto("/");
  await page.getByTestId("my-sessions-tab").click();
  const invite = page.getByTestId("invite-row");
  await expect(invite).toBeVisible();
  await expectWithinViewport(page, invite);
  const accept = page.getByTestId(`accept-invite-${sessionId}`);
  await expectWithinViewport(page, accept);
  await accept.click();
  const contact = page.getByTestId(`session-contact-${host.profileId}`);
  await expect(contact).toBeVisible();
  await expect(contact.getByLabel(`${context.host.nickname} 的 LINE ID`)).toHaveValue(context.host.lineId);
  expect(runtimeErrors).toEqual([]);
});
