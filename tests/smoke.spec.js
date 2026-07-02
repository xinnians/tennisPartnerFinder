import { expect, test } from "@playwright/test";

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

async function installFakeMaps(page) {
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: fakeMapsScript,
    })
  );
}

test("loads, switches tabs, opens a player sheet, sends an invite, and saves profile", async ({ page }) => {
  const runtimeErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") runtimeErrors.push(msg.text());
  });
  page.on("pageerror", (err) => runtimeErrors.push(err.message));

  await installFakeMaps(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/Tennis Partner Finder/);
  await expect(page.getByText("找球伴")).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");

  await page.getByRole("button", { name: /我的邀請/ }).click();
  await expect(page.getByText("你送出的邀請與回覆狀態")).toBeVisible();

  await page.getByRole("button", { name: /個人檔案/ }).click();
  await expect(page.getByLabel("暱稱")).toBeVisible();

  await page.getByRole("button", { name: /^地圖$/ }).click();
  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await expect(page.locator("#sheet-root .psheet__nick")).toHaveText("Amber");

  await page.getByRole("button", { name: "送出邀請" }).click();
  await expect(page.getByText("送出邀請給")).toBeVisible();
  await page.getByRole("button", { name: "週三晚上" }).click();
  await page.getByPlaceholder(/打聲招呼/).fill("Playwright smoke invite");
  await page.getByRole("button", { name: "送出邀請" }).click();
  await expect(page.getByText("邀請已送出!")).toBeVisible();

  await page.getByRole("button", { name: "查看我的邀請" }).click();
  await expect(page.getByText("Playwright smoke invite")).toBeVisible();
  await expect(page.getByText("待回覆")).toBeVisible();

  await page.getByRole("button", { name: /個人檔案/ }).click();
  await page.getByRole("button", { name: "儲存檔案" }).click();
  await expect(page.getByText("已儲存")).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test("falls back to the placeholder when Google Maps auth fails", async ({ page }) => {
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.gm_authFailure?.();",
    })
  );

  await page.goto("/");

  await expect(page.getByText("還差一步:填入 Google Maps API key")).toBeVisible();
  await expect(page.locator("#placeholder-courts")).toContainText("台北網球中心");
});
