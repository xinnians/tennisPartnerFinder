import { expect, test } from "@playwright/test";
import { expectWithinViewport, installFakeMaps } from "./fixtures/fakeMaps.js";

test("loads, uses quick contact, and saves profile", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: /我的邀請/ })).toHaveCount(0);

  await page.getByRole("button", { name: /個人檔案/ }).click();
  await expect(page.getByLabel("暱稱")).toBeVisible();
  await expect(page.getByText("公開我的球友卡")).toBeVisible();
  await expect(page.getByText("讓其他球友透過 LINE 找你約球")).toBeVisible();
  await page.getByRole("button", { name: "儲存檔案" }).click();
  await expect(page.getByText("已儲存")).toBeVisible();

  await page.getByRole("button", { name: /^地圖$/ }).click();
  await page.getByRole("button", { name: /地圖圖釘 大佳河濱公園網球場/ }).click();
  await expect(page.locator("#sheet-root .psheet__nick")).toHaveText("Amber");
  await expect(page.locator("#sheet-root")).not.toContainText("amber.tw");
  await expect(page.getByRole("button", { name: "快速約球" })).toBeVisible();

  await page.getByRole("button", { name: "快速約球" }).click();
  await expect(page.getByText(/先補齊 .*LINE ID/)).toBeVisible();
  await expect(page.locator("#tab-profile .page__title")).toHaveText("個人檔案");

  await page.getByLabel("暱稱").fill("Me");
  await page.getByPlaceholder("輸入你的 LINE ID").fill("my_line_id");
  await page.getByRole("button", { name: /^地圖$/ }).click();
  await page.getByRole("button", { name: /地圖圖釘 大佳河濱公園網球場/ }).click();
  await page.getByRole("button", { name: "快速約球" }).click();

  await expect(page.getByText("快速約球給")).toBeVisible();
  await expect(page.locator("#modal-root .modal__nick")).toHaveText("Amber");
  await expectWithinViewport(page, page.locator("#modal-root .modal"));
  await expect(page.getByText("amber.tw")).toBeVisible();
  await expect(page.getByRole("button", { name: "複製 LINE ID" })).toBeVisible();
  await expect(page.getByRole("button", { name: "複製開場白" })).toBeVisible();
  await page.getByRole("button", { name: "週三晚上" }).click();
  await expect(page.locator(".contact-opener")).toContainText("青年公園網球場");
  await expect(page.locator(".contact-opener")).toContainText("週三晚上");
  await expect(page.locator(".contact-opener")).toContainText("3.5");

  expect(runtimeErrors).toEqual([]);
});

test("profile court picker searches, selects, and keeps search focus", async ({ page }) => {
  const runtimeErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") runtimeErrors.push(msg.text());
  });
  page.on("pageerror", (err) => runtimeErrors.push(err.message));

  await installFakeMaps(page);
  await page.goto("/");

  await page.getByRole("button", { name: /個人檔案/ }).click();
  // defaultProfile 已預選青年公園網球場,一進來就該有一顆 chip
  await expect(page.locator("#prof-courts .court-chip", { hasText: "青年公園網球場" })).toBeVisible();

  const search = page.getByLabel("搜尋球場");
  await search.pressSequentially("青年", { delay: 20 });
  await expect(page.locator("#prof-courts .prof-court")).toHaveCount(1);
  await expect(search).toBeFocused();

  // 換一個尚未選取的球場,驗證搜尋→點選→出現 chip 的流程
  await search.fill("彩虹");
  await expect(page.locator("#prof-courts .prof-court")).toHaveCount(1);
  await expect(search).toBeFocused();
  await page.locator("#prof-courts .prof-court", { hasText: "彩虹河濱公園網球場" }).click();
  await expect(page.locator("#prof-courts .court-chip", { hasText: "彩虹河濱公園網球場" })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test("court picker derives city groups from court data", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { mountCourtPicker } = await import("/src/courtPicker.js");
    const container = document.createElement("div");
    container.id = "city-picker-test";
    document.body.append(container);
    const picker = mountCourtPicker(container, {
      getSelected: () => new Set(),
      onToggle: () => {},
    });
    picker.setCourts([
      { name: "資料驅動測試球場", city: "測試市", district: "測試區", lat: 25, lng: 121 },
    ]);
  });

  await expect(page.locator("#city-picker-test .court-picker__city")).toHaveText("測試市");
  await expect(page.locator("#city-picker-test .court-picker__district")).toHaveText("測試區");
});

test("external demand pins keep the source-link flow", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await page.getByRole("button", { name: /地圖圖釘 古亭河濱公園網球場/ }).evaluate((el) => el.click());

  await expect(page.getByText("古亭河濱公園網球場 附近")).toBeVisible();
  await expect(page.getByText("查看原貼文")).toBeVisible();
  await expect(page.locator("#sheet-root")).not.toContainText("快速約球");
  await expect(page.locator("#sheet-root")).not.toContainText("回應需求");
});

test("court base pins render under every court and open the drawer without clashing with overlay pins", async ({ page }) => {
  const runtimeErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") runtimeErrors.push(msg.text());
  });
  page.on("pageerror", (err) => runtimeErrors.push(err.message));

  await installFakeMaps(page);
  await page.goto("/");

  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");

  // 底圖釘(title 前綴「球場 」)與 overlay 釘(球友/需求/聚合)aria-label 不同字串,
  // strict-mode 不應互相衝突。
  await expect(page.getByRole("button", { name: /^地圖圖釘 大佳河濱公園網球場$/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^地圖圖釘 球場 大佳河濱公園網球場$/ })).toHaveCount(1);

  // 青年公園網球場 mock 資料:1 位球友(Momo)+ 3 則需求(d2/d5/d6)= 4 筆
  await page.getByRole("button", { name: /地圖圖釘 球場 青年公園網球場/ }).click();
  await expect(page.locator(".drawer__court")).toHaveText("青年公園網球場");
  await expect(page.locator(".drawer__sub")).toContainText("萬華區");
  await expect(page.locator(".drawer__item")).toHaveCount(4);

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
