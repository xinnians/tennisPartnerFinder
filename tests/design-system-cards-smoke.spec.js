import { expect, test } from "@playwright/test";

import { DESIGN_SYSTEM_CARD_PATHS } from "../scripts/designSystemBundle.mjs";
import { createTouchTargetScanner, expectTouchTargets } from "./fixtures/touchTargets.js";

const TOKEN_CARD_PATH = "ds-bundle/components/foundations/Tokens/Tokens.html";

for (const cardPath of DESIGN_SYSTEM_CARD_PATHS) {
  test(`${cardPath} keeps mobile actionable controls at least 44px`, async ({ page }) => {
    const runtimeErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });

    const response = await page.goto(`/${cardPath}`);
    expect(response?.status(), `${cardPath} must render over HTTP`).toBe(200);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    if (cardPath === TOKEN_CARD_PATH) {
      expect(
        await createTouchTargetScanner(page)("body"),
        `${cardPath} only contains a disabled status sample`
      ).toEqual([]);
    } else {
      await expectTouchTargets(page, "body", 1, `${cardPath}：`);
    }
    expect(runtimeErrors, `${cardPath} must render without runtime errors`).toEqual([]);
  });
}

test("the mobile touch-target scanner detects a 43px canary and honors effective hit areas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      button { box-sizing: border-box; border: 0; padding: 0; }
      #undersized { width: 43px; height: 43px; }
      #expanded { position: relative; width: 30px; height: 30px; }
      #expanded::before { content: ""; position: absolute; inset: -7px; }
      #wrapped { display: flex; align-items: center; width: 44px; height: 44px; }
      #wrapped input { width: 1px; height: 1px; opacity: 0; }
    </style>
    <button id="undersized" type="button" aria-label="43px canary"></button>
    <button id="disabled" type="button" style="width:20px;height:20px" disabled></button>
    <button id="expanded" type="button" aria-label="expanded target"></button>
    <label id="wrapped"><input type="checkbox">選擇</label>
  `);

  const targets = await createTouchTargetScanner(page)("body");
  expect(targets).toEqual([
    { height: 43, name: "43px canary", width: 43 },
    { height: 44, name: "expanded target", width: 44 },
    { height: 44, name: "wrapped", width: 44 },
  ]);
  expect(targets.filter(({ height, width }) => height < 44 || width < 44)).toEqual([
    { height: 43, name: "43px canary", width: 43 },
  ]);
});
