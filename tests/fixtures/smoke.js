import { expect, test as base } from "@playwright/test";

import { installAppModuleImporter, installAppTestHooks } from "./appRuntime.js";

export { expectWithinViewport, installFakeMaps, setFakeMapBounds } from "./fakeMaps.js";
export { readAppTestHook } from "./appRuntime.js";
export { expect, test };

const test = base.extend({
  page: async ({ page }, use) => {
    await installAppModuleImporter(page);
    await use(page);
  },
});

export const publicSurface = (page) => page.locator("#app");

export const TAINTED_PUBLIC_VALUES = [
  "TAINT_LINE_ID",
  "TAINT_PROFILE_ID",
  "TAINT_HOST_PROFILE_ID",
  "TAINT_REAL_NAME",
  "TAINT_PROFILE_URL",
  "TAINT_SOURCE_URL",
  "TAINT_USUAL_COURTS",
];

export async function installTaintedMockSessions(page) {
  await installAppTestHooks(page, {
    mockData: {
      sessionTaint: {
        lineId: "TAINT_LINE_ID",
        profileId: "TAINT_PROFILE_ID",
        hostProfileId: "TAINT_HOST_PROFILE_ID",
        realName: "TAINT_REAL_NAME",
        profileUrl: "TAINT_PROFILE_URL",
        sourceUrl: "TAINT_SOURCE_URL",
        usualCourts: "TAINT_USUAL_COURTS",
      },
    },
  });
}

export async function installGeolocation(page, responses) {
  await page.addInitScript((nextResponses) => {
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          const response = nextResponses[Math.min(calls, nextResponses.length - 1)];
          calls += 1;
          if (response.error) failure(response.error);
          else success({ coords: response.coords });
        },
      },
    });
    window.__geolocationCallCount = () => calls;
  }, responses);
}

export async function installControlledGeolocation(page) {
  await page.addInitScript(() => {
    const callbacks = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          callbacks.push({ failure, success });
        },
      },
    });
    window.__geolocationCallCount = () => callbacks.length;
    window.__resolveGeolocation = (index, latitude, longitude) => {
      callbacks[index]?.success({ coords: { latitude, longitude } });
    };
    window.__rejectGeolocation = (index) => callbacks[index]?.failure({ code: 1, message: "denied" });
  });
}

export function captureConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

export async function delayMockCourts(page, milliseconds) {
  await installAppTestHooks(page, {
    dataApi: { loadCourts: { delayMs: milliseconds } },
  });
}

// 批 D4a:退場的 #date-filter 曾是「一鍵強制零結果」的最簡單控件。新模型下 districts
// 是唯一能可靠、決定性地清空結果集的維度——文山區在 mockData.js 的 8 局中零命中
// (courtDistrict 只出現內湖/中山/中正/士林/萬華五區,見批次回報),不像 dateKey=weekend
// 那樣會隨「今天是星期幾」而不穩定。
export async function forceZeroMatchDistrictFilter(page) {
  await page.locator("#filter-sheet-open").click();
  await page.locator('#filters-sheet [data-filter="districts"][data-value="文山區"]').click();
  await page.locator("#filters-sheet [data-surface-close]").click();
}
