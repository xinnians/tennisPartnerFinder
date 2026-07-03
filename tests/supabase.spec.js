import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const AUTH_STORAGE_KEY = "tennis-partner-finder-auth";

test.setTimeout(90_000);

const fakeMapsScript = `
(() => {
  const markers = [];

  class Size {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  }

  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }

  class Map {
    constructor(el, options) {
      this.el = el;
      this.center = options.center;
      this.zoom = options.zoom;
      el.dataset.fakeGoogleMap = "ready";
      el.style.position = "relative";
    }

    getZoom() {
      return this.zoom;
    }

    setZoom(zoom) {
      this.zoom = zoom;
    }

    panTo(center) {
      this.center = center;
    }
  }

  class Marker {
    constructor(options) {
      this.options = options;
      this.map = options.map;
      this.el = document.createElement("button");
      const label = typeof options.label === "string" ? options.label : options.label?.text;
      this.el.type = "button";
      this.el.className = "test-marker";
      this.el.textContent = label || options.title || "marker";
      this.el.setAttribute("aria-label", "地圖圖釘 " + (options.title || label || "marker"));
      this.el.style.position = "absolute";
      this.el.style.left = 20 + markers.length * 12 + "px";
      this.el.style.top = 120 + markers.length * 8 + "px";
      this.el.style.zIndex = String(options.zIndex || 1);
      markers.push(this);
      this.map?.el?.appendChild(this.el);
    }

    addListener(event, callback) {
      this.el.addEventListener(event, callback);
      return { remove: () => this.el.removeEventListener(event, callback) };
    }

    setMap(map) {
      this.el.remove();
      this.map = map;
      this.map?.el?.appendChild(this.el);
    }
  }

  window.google = { maps: { Map, Marker, Point, Size } };
  window.__onGoogleMapsReady?.();
})();
`;

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUpUser(email) {
  const supabase = makeClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: "password123",
  });
  if (error) throw error;
  if (!data.session) throw new Error(`Expected signUp to create a session for ${email}`);
  return { client: supabase, session: data.session };
}

async function courtIdByName(client, name) {
  const { data, error } = await client.from("courts").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function createProfile(client, profile) {
  const { data, error } = await client
    .from("profiles")
    .insert({
      nickname: profile.nickname,
      ntrp: profile.ntrp,
      line_id: profile.lineId,
      is_public: profile.isPublic,
      user_id: profile.userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const profileId = data.id;
  const courtIds = [];
  for (const courtName of profile.courts) {
    courtIds.push(await courtIdByName(client, courtName));
  }

  if (courtIds.length > 0) {
    const { error: courtsError } = await client
      .from("profile_courts")
      .insert(courtIds.map((court_id) => ({ profile_id: profileId, court_id })));
    if (courtsError) throw courtsError;
  }

  if (profile.playTypes.length > 0) {
    const { error: typesError } = await client
      .from("profile_play_types")
      .insert(profile.playTypes.map((play_type) => ({ profile_id: profileId, play_type })));
    if (typesError) throw typesError;
  }

  if (profile.slots.length > 0) {
    const { error: slotsError } = await client
      .from("profile_slots")
      .insert(profile.slots.map((slot_code) => ({ profile_id: profileId, slot_code })));
    if (slotsError) throw slotsError;
  }

  return profileId;
}

async function installFakeMaps(page) {
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: fakeMapsScript,
    })
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function installEmptyDiscovery(page, { delayMs = 0 } = {}) {
  await page.route(`${SUPABASE_URL}/rest/v1/public_profile_discovery**`, async (route) => {
    if (delayMs) await wait(delayMs);
    await route.fulfill({
      contentType: "application/json",
      body: "[]",
    });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/partner_requests**`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    if (delayMs) await wait(delayMs);
    await route.fulfill({
      contentType: "application/json",
      body: "[]",
    });
  });
}

async function installFailThenRetryDiscovery(page) {
  let attempts = 0;
  await page.route(`${SUPABASE_URL}/rest/v1/public_profile_discovery**`, async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "forced discovery failure" }),
      });
      return;
    }
    await route.continue();
  });
}

async function setBrowserSession(page, session) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: AUTH_STORAGE_KEY, value: session }
  );
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async () => {
  execFileSync("npx", ["supabase", "db", "reset"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  const email = `public-player-${Date.now()}@example.test`;
  const { client, session } = await signUpUser(email);
  await createProfile(client, {
    userId: session.user.id,
    nickname: "Local Ace",
    ntrp: 4.0,
    lineId: "local_ace_line",
    isPublic: true,
    courts: ["大安森林公園網球場"],
    playTypes: ["單打", "對拉"],
    slots: ["we-m", "wd-e"],
  });
});

test("shows loading, empty, error, and retry states for Supabase map data", async ({ page }) => {
  await installFakeMaps(page);
  await installEmptyDiscovery(page, { delayMs: 350 });
  await page.goto("/");

  await expect(page.getByText("正在載入球友資料")).toBeVisible();
  await expect(page.getByText("目前沒有公開球友或需求")).toBeVisible();

  await page.unroute(`${SUPABASE_URL}/rest/v1/public_profile_discovery**`);
  await page.unroute(`${SUPABASE_URL}/rest/v1/partner_requests**`);
  await installFailThenRetryDiscovery(page);
  await page.reload();

  await expect(page.getByText("資料載入失敗")).toBeVisible();
  await page.getByRole("button", { name: "重新載入" }).click();
  await expect(page.locator("#sheet-root")).toHaveCount(1);
  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await expect(page.locator("#sheet-root .psheet__nick")).toHaveText("Local Ace");
});

test("login modal offers Google OAuth for beta without LINE or email magic link", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await page.getByRole("button", { name: "登入" }).click();

  await expect(page.getByText("登入後繼續")).toBeVisible();
  await expect(page.locator("#login-title")).toHaveText("Google");
  await expect(page.getByRole("button", { name: "使用 Google 登入" })).toBeVisible();
  await expect(page.getByRole("button", { name: "使用 LINE 登入" })).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "寄送登入信" })).toHaveCount(0);
});

test("login modal redirects to Supabase Google OAuth", async ({ page }) => {
  await installFakeMaps(page);
  await page.route(`${SUPABASE_URL}/auth/v1/authorize**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>OAuth redirect captured</title>",
    })
  );
  await page.goto("/");

  await page.getByRole("button", { name: "登入" }).click();
  const authRequest = page.waitForRequest(`${SUPABASE_URL}/auth/v1/authorize**`);
  await page.getByRole("button", { name: "使用 Google 登入" }).click();

  const request = await authRequest;
  const url = new URL(request.url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe("http://127.0.0.1:5175");
  expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
});

test("signed-out users can browse but quick contact opens login", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await expect(page.locator("#sheet-root .psheet__nick")).toHaveText("Local Ace");
  await expect(page.locator("#sheet-root")).not.toContainText("local_ace_line");

  await page.getByRole("button", { name: "快速約球" }).click();
  await expect(page.getByText("登入後繼續")).toBeVisible();
  await page.getByRole("button", { name: "✕" }).click();

  await page.getByRole("button", { name: "發布需求" }).click();
  await expect(page.getByText("登入後繼續")).toBeVisible();
});

test("signed-in users can save profile, quick contact, and publish a request", async ({ page }) => {
  const email = `viewer-${Date.now()}@example.test`;
  const { session } = await signUpUser(email);

  await installFakeMaps(page);
  await setBrowserSession(page, session);
  await page.goto("/");

  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await page.getByRole("button", { name: "快速約球" }).click();
  await expect(page.getByText(/先補齊/)).toBeVisible();
  await expect(page.locator("#tab-profile .page__title")).toHaveText("個人檔案");
  await page.getByRole("button", { name: "公開我的球友卡" }).click();
  await expect(page.getByText(/公開前請先補齊/)).toBeVisible();

  await page.getByLabel("暱稱").fill("Viewer");
  await page.getByPlaceholder("輸入你的 LINE ID").fill("viewer_line");
  await page.getByRole("button", { name: "儲存檔案" }).click();
  await expect(page.getByText("已儲存到 Supabase")).toBeVisible();

  await page.getByRole("button", { name: /^地圖$/ }).click();
  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await expect(page.locator("#sheet-root")).not.toContainText("local_ace_line");
  await page.getByRole("button", { name: "快速約球" }).click();
  await expect(page.getByText("local_ace_line")).toBeVisible();

  await page.getByRole("button", { name: "發布需求" }).click();
  await page.getByLabel("球場", { exact: true }).selectOption({ label: "大安森林公園網球場" });
  await page.getByLabel("想約時間", { exact: true }).fill("週六下午");
  await page.getByLabel("大概程度", { exact: true }).fill("3.5 左右");
  await page.getByLabel("需求內容", { exact: true }).fill("想找 3.5 左右球友對拉");
  await page.route(`${SUPABASE_URL}/rest/v1/partner_requests**`, async (route) => {
    if (route.request().method() === "POST") await wait(350);
    await route.continue();
  });
  await page.getByRole("button", { name: "送出需求" }).click();
  await expect(page.getByRole("button", { name: "送出需求" })).toBeDisabled();
  await expect(page.getByText("需求已發布")).toBeVisible();

  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await expect(page.locator("#sheet-root")).toContainText("想找 3.5 左右球友對拉");
});

test("sign-out clears current profile and gates quick contact again", async ({ page }) => {
  const email = `signout-${Date.now()}@example.test`;
  const { session } = await signUpUser(email);

  await installFakeMaps(page);
  await setBrowserSession(page, session);
  await page.goto("/");

  await page.getByRole("button", { name: /個人檔案/ }).click();
  await page.getByLabel("暱稱").fill("Sign Out");
  await page.getByPlaceholder("輸入你的 LINE ID").fill("signout_line");
  await page.getByRole("button", { name: "儲存檔案" }).click();
  await expect(page.getByText("已儲存到 Supabase")).toBeVisible();

  await page.getByRole("button", { name: "登出" }).click();
  await expect(page.getByText("已登出")).toBeVisible();
  await expect(page.getByLabel("暱稱")).toHaveValue("我");
  await expect(page.getByPlaceholder("輸入你的 LINE ID")).toHaveValue("");

  await page.getByRole("button", { name: /^地圖$/ }).click();
  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  const localAceDrawerItem = page.getByRole("button", { name: /Local Ace/ }).first();
  try {
    await localAceDrawerItem.waitFor({ state: "visible", timeout: 700 });
    await localAceDrawerItem.click();
  } catch {
    // The marker may be a direct player pin when no same-court request exists.
  }
  await page.getByRole("button", { name: "快速約球" }).click();
  await expect(page.getByText("登入後繼續")).toBeVisible();
});
