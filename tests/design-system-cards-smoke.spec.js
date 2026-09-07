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
