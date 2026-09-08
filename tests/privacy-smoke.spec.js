import { expect, test } from "@playwright/test";

test("privacy page discloses verified Edge IP and dormant Push v2 storage scope", async ({ page }) => {
  const runtimeErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/privacy.html");

  await expect(page.getByRole("heading", { level: 1, name: "隱私權政策" })).toBeVisible();
  await expect(page.locator(".meta")).toHaveText("生效日期：2026 年 9 月 8 日");
  await expect(page.getByText(/Supabase 平台可能短期記錄請求來源 IP/u)).toBeVisible();
  await expect(page.getByText(/Free 方案，這類平台紀錄保留 1 天/u)).toBeVisible();
  await expect(page.getByText(/新版推播目前尚未正式啟用/u)).toBeVisible();
  await expect(page.getByText(/IndexedDB 保存這台裝置的/u)).toBeVisible();
  await expect(page.getByRole("link", { name: "回到球咖" })).toHaveAttribute("href", "/");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
  expect(runtimeErrors).toEqual([]);
});
