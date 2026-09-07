import { expect } from "@playwright/test";

const PRIVATE_DATA_CHUNK_MARKER = "tennis_private_data_repository_v1";

export function captureProductionRuntimeErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    errors.push(location ? `${message.text()} @ ${location}` : message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/**
 * Read production JavaScript responses rather than trusting a hashed filename.
 * Both the anonymous assertion and authenticated positive control use this
 * exact response probe, so an empty anonymous result cannot be a false negative.
 */
export function installPrivateDataChunkProbe(page) {
  const matches = [];
  const pendingReads = new Set();
  const failures = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/assets/") || !url.pathname.endsWith(".js")) return;
    const read = response
      .body()
      .then((body) => {
        if (body.includes(PRIVATE_DATA_CHUNK_MARKER)) matches.push(response.url());
      })
      .catch((error) => failures.push(error))
      .finally(() => pendingReads.delete(read));
    pendingReads.add(read);
  });
  return {
    async settle() {
      await Promise.all([...pendingReads]);
      if (failures.length > 0) throw failures[0];
      return [...matches];
    },
  };
}

export async function installCrossEngineLatency(page, milliseconds = 150) {
  await page.route("**/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    await route.fallback();
  });
}

export async function installLocalPreviewPlatformStubs(page) {
  // Vite preview has no Vercel Analytics endpoint. Keep the production loader
  // active, but replace only the hosting-platform script that cannot exist on
  // localhost so its expected 404 does not hide real console failures.
  await page.route("**/_vercel/insights/script.js", (route) =>
    route.fulfill({ body: "", contentType: "application/javascript", status: 200 })
  );
}

export async function expectProductionShell(page) {
  await expect(page).toHaveTitle("球咖｜台北網球");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.getByRole("region", { name: "台北市球局地圖" })).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
}

export async function recordProductionPreviewMetrics(page, testInfo, scenario, timing) {
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const scripts = resources.filter((entry) => entry.initiatorType === "script");
    const rounded = (value) => Math.round(Number(value) * 10) / 10;
    return {
      decodedScriptBytes: scripts.reduce((total, entry) => total + (entry.decodedBodySize || 0), 0),
      domContentLoadedMs: rounded(navigation?.domContentLoadedEventEnd ?? 0),
      encodedScriptBytes: scripts.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0),
      loadEventMs: rounded(navigation?.loadEventEnd ?? 0),
      resourceCount: resources.length,
      scriptCount: scripts.length,
      transferScriptBytes: scripts.reduce((total, entry) => total + (entry.transferSize || 0), 0),
    };
  });
  const result = { ...metrics, scenario, ...timing };
  await testInfo.attach(`production-preview-${scenario}.json`, {
    body: Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
    contentType: "application/json",
  });
  console.log(`[production-preview] ${JSON.stringify(result)}`);
  return result;
}
