import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installFakeMaps } from "./fixtures/fakeMaps.js";
import { createProfile, setBrowserSession, signUpUser, courtIdByName } from "./fixtures/localSupabase.js";
import { installLocalPreviewPlatformStubs, captureProductionRuntimeErrors } from "./fixtures/productionPreview.js";
import { createSessionViaRpc, createFutureSessionInput } from "./fixtures/sessionFactory.js";

import { COURT_GUIDE_NAMES } from "../src/features/guides/courtGuideCatalog.ts";

const guide = "/courts/youth-park/";
const output = "docs/growth/g09-expansion-qa/local";
async function setup(page) {
  await installLocalPreviewPlatformStubs(page);
  await installFakeMaps(page);
  return captureProductionRuntimeErrors(page);
}
async function account() {
  const user = await signUpUser(`guide-${randomUUID()}@example.test`);
  await createProfile(user.client, { nickname: "指南測試", ntrp: 3.5, courts: ["青年公園網球場"] });
  return user;
}

test("static guides render before API, remain readable on failure, retry and exclude Maps", async ({
  page,
  request,
}, info) => {
  const errors = await setup(page);
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  await mkdir(output, { recursive: true });
  for (const path of ["/courts/", ...Object.keys(COURT_GUIDE_NAMES).map((slug) => `/courts/${slug}/`)]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("球場指南");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("noindex");
  }
  expect((await request.get("/courts/unknown/")).status()).toBe(404);
  await page.goto("/courts/");
  await expect(page.locator(".guide-index-card")).toHaveCount(Object.keys(COURT_GUIDE_NAMES).length);
  await page.screenshot({ path: `${output}/index-${info.project.name}.png`, fullPage: true });
  await page.route("**/rest/v1/session_discovery?**", (route) => route.abort());
  await page.goto(guide);
  await expect(page.getByRole("heading", { name: "青年公園網球場", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新載入" })).toBeVisible();
  await page.screenshot({ path: `${output}/error-${info.project.name}.png`, fullPage: true });
  await page.unroute("**/rest/v1/session_discovery?**");
  await page.getByRole("button", { name: "重新載入" }).click();
  await expect(page.locator("#guide-session-list")).not.toContainText("正在載入");
  await expect(page.locator("#guide-sessions-title")).toBeFocused();
  await page.screenshot({ path: `${output}/guide-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    urls.filter((url) => /maps\.googleapis|privateDataRepository|notificationPushRuntimeComposition/.test(url))
  ).toEqual([]);
  // Deliberate aborted fetch is the one expected console network error.
  expect(errors.filter((error) => !/ERR_FAILED|Failed to fetch|net::/.test(String(error.message ?? error)))).toEqual(
    []
  );
});

test("guide create entry preserves court through sign-in, cancel clears intent, subscription does not mutate", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto(guide);
  await page.getByRole("link", { name: "在這裡開球局", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem("tennis-partner-finder:pending-session-intent")))
  ).toEqual({ action: "create", courtSlug: "youth-park" });
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("tennis-partner-finder:pending-session-intent")))
    .toBeNull();
  const { session, client } = await account();
  const courtId = await courtIdByName(client, "青年公園網球場");
  await setBrowserSession(page, session);
  await page.goto("/?courtGuide=youth-park&guideAction=create#tab-map");
  await expect(page.getByTestId("session-form")).toBeVisible();
  await expect(page.getByTestId(`create-court-${courtId}`)).toHaveClass(/is-selected/);
  await page.keyboard.press("Escape");
  const writes = [];
  page.on("request", (r) => {
    if (/set_court_subscriptions|set_notification_prefs/.test(r.url())) writes.push(r.url());
  });
  await page.goto("/?courtGuide=youth-park&guideAction=subscribe#tab-me");
  await expect(page.locator("[data-guide-subscription-hint]")).toContainText("青年公園網球場");
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("raw share response and guide live query use real local sessions and old/new routes agree", async ({
  page,
  request,
}) => {
  const errors = await setup(page);
  const { client } = await account();
  const courtId = await courtIdByName(client, "青年公園網球場");
  const id = await createSessionViaRpc(
    client,
    createFutureSessionInput({ courtId, notes: "private-guide-note", feeNote: "private-guide-fee" })
  );
  const response = await request.get(`/s/${id}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("青年公園網球場");
  expect(html).toContain('property="og:title"');
  expect(html).not.toContain("private-guide-note");
  expect(html).not.toContain("private-guide-fee");
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto(`/s/${id}`);
  await expect(page).toHaveURL(new RegExp(`/#/session/${id}$`));
  await expect(page.getByRole("dialog")).toContainText("青年公園網球場");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("青年公園網球場");
  const discovery = page.waitForRequest(
    (r) => r.url().includes("/rest/v1/session_discovery?") && new URL(r.url()).searchParams.has("court_id")
  );
  await page.goto(guide);
  const params = new URL((await discovery).url()).searchParams;
  expect(params.get("court_id")).toBe(`eq.${courtId}`);
  expect(params.get("limit")).toBe("4");
  await expect(page.locator("#guide-session-list")).not.toContainText("正在載入");
  expect(await page.locator(".guide-session-card").count()).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});

test("guide create survives the OAuth callback with the same court and no automatic publish", async ({ page }) => {
  const errors = await setup(page);
  const { session, client } = await account();
  const courtId = await courtIdByName(client, "青年公園網球場");
  await page.goto("/?courtGuide=youth-park&guideAction=create#tab-map");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("tennis-partner-finder-auth-code-verifier", JSON.stringify("guide-verifier"))
  );
  await page.route("**/auth/v1/token?grant_type=pkce", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) })
  );
  const publishes = [];
  page.on("request", (r) => {
    if (r.url().includes("/rpc/create_session")) publishes.push(r.url());
  });
  await page.goto("/?code=guide-test-callback");
  await expect(page.getByTestId("session-form")).toBeVisible();
  await expect(page.getByTestId(`create-court-${courtId}`)).toHaveClass(/is-selected/);
  expect(publishes).toEqual([]);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("tennis-partner-finder:pending-session-intent")))
    .toBeNull();
  expect(errors).toEqual([]);
});

test("guide subscription returns from OAuth to the visible notification heading without saving preferences", async ({
  page,
}) => {
  const errors = await setup(page);
  const { session } = await account();
  const writes = [];
  page.on("request", (r) => {
    if (/set_court_subscriptions|set_notification_prefs/.test(r.url())) writes.push(r.url());
  });
  await page.goto("/?courtGuide=youth-park&guideAction=subscribe#tab-me");
  await expect(page.getByTestId("me-sign-in")).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("tennis-partner-finder-auth-code-verifier", JSON.stringify("guide-subscription-verifier"))
  );
  await page.route("**/auth/v1/token?grant_type=pkce", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) })
  );
  await page.goto("/?code=guide-subscription-callback");
  await expect(page.locator("[data-notification-settings-heading]")).toBeFocused();
  await expect(page.locator("[data-notification-settings-heading]")).toBeInViewport();
  await expect(page.locator("[data-guide-subscription-hint]")).toContainText("青年公園網球場");
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("every published guide opens a draft for its own court without publishing", async ({ page }) => {
  const errors = await setup(page);
  const { session, client } = await account();
  await setBrowserSession(page, session);
  const writes = [];
  page.on("request", (r) => {
    if (/create_session|set_court_subscriptions|set_notification_prefs/.test(r.url())) writes.push(r.url());
  });
  for (const [slug, name] of Object.entries(COURT_GUIDE_NAMES)) {
    const courtId = await courtIdByName(client, name);
    await page.goto(`/courts/${slug}/`);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "在這裡開球局", exact: true }).first().click();
    await expect(page.getByTestId("session-form")).toBeVisible();
    await expect(page.getByTestId(`create-court-${courtId}`)).toHaveClass(/is-selected/);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("session-form")).toHaveCount(0);
  }
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
