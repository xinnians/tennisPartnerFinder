/* global window, document, location */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { applyByteLimitPolicy, BUNDLE_SIZE_LIMITS, BYTE_LIMIT_MODES } from "./productionBundlePolicy.mjs";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "https://qiuka.tw/" },
    output: { type: "string", default: "test-results/production-performance.json" },
    runs: { type: "string", default: "3" },
    "enforce-lab-targets": { type: "boolean", default: false },
    "enforce-startup-byte-limits": { type: "boolean", default: false },
  },
});
const target = new URL(values.url);
const runs = Number(values.runs);
if (!["http:", "https:"].includes(target.protocol) || !Number.isInteger(runs) || runs < 1 || runs > 10) {
  throw new Error("Use an HTTP(S) URL and 1–10 runs.");
}
const median = (numbers) => {
  const sorted = [...numbers].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const browser = await chromium.launch();
const samples = [];
try {
  for (const mobile of [false, true]) {
    for (let run = 1; run <= runs; run += 1) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        isMobile: mobile,
        deviceScaleFactor: 1,
        timezoneId: "Asia/Taipei",
      });
      try {
        const page = await context.newPage();
        let pageErrors = 0;
        page.on("pageerror", () => {
          pageErrors += 1;
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        if (mobile) {
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: 150,
            downloadThroughput: 200000,
            uploadThroughput: 93750,
          });
        }
        await page.addInitScript(() => {
          window.__qiukaLab = { lcpMs: 0, lcpElement: null, cls: 0, interactionDurationsMs: [] };
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__qiukaLab.lcpMs = entry.startTime;
              window.__qiukaLab.lcpElement = entry.element
                ? { tag: entry.element.tagName, id: entry.element.id }
                : null;
            }
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__qiukaLab.cls += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.interactionId) window.__qiukaLab.interactionDurationsMs.push(entry.duration);
            }
          }).observe({ type: "event", buffered: true, durationThreshold: 16 });
        });
        await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.locator("#filter-sheet-open").waitFor({ state: "visible", timeout: 60000 });
        const shellReadyMs = await page.evaluate(() => performance.now());
        await page.locator("#map .gm-style").waitFor({ state: "attached", timeout: 60000 });
        const mapContainerReadyMs = await page.evaluate(() => performance.now());
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        // Observe the initial page before any input ends the LCP observation window.
        await page.waitForTimeout(2000);
        const initial = await page.evaluate(() => {
          const scripts = performance.getEntriesByType("resource").filter((entry) => {
            const url = new URL(entry.name);
            return url.origin === location.origin && url.pathname.endsWith(".js");
          });
          return {
            ...window.__qiukaLab,
            firstPartyScriptCount: scripts.length,
            firstPartyRawBytes: scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
            firstPartyEncodedBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
            scriptSizesAvailable:
              scripts.length > 0 && scripts.every((entry) => entry.decodedBodySize > 0 && entry.encodedBodySize > 0),
          };
        });
        const filterStarted = performance.now();
        await page.locator("#filter-sheet-open").click();
        await page.locator("#filters-sheet").waitFor({ state: "visible" });
        const filterOpenMs = performance.now() - filterStarted;
        await page.waitForTimeout(300);
        const interactions = await page.evaluate(() => window.__qiukaLab.interactionDurationsMs);
        samples.push({
          mobile,
          run,
          shellReadyMs,
          mapContainerReadyMs,
          filterOpenMs,
          lcpMs: initial.lcpMs,
          lcpElement: initial.lcpElement,
          cls: initial.cls,
          maxObservedInteractionMs: Math.max(0, ...interactions),
          pageErrors,
          firstPartyScriptCount: initial.firstPartyScriptCount,
          firstPartyRawBytes: initial.firstPartyRawBytes,
          firstPartyEncodedBytes: initial.firstPartyEncodedBytes,
          scriptSizesAvailable: initial.scriptSizesAvailable,
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
const summary = [false, true].map((mobile) => {
  const group = samples.filter((sample) => sample.mobile === mobile);
  return {
    mobile,
    medianLcpMs: median(group.map((sample) => sample.lcpMs)),
    medianShellReadyMs: median(group.map((sample) => sample.shellReadyMs)),
    medianMapContainerReadyMs: median(group.map((sample) => sample.mapContainerReadyMs)),
    medianFilterOpenMs: median(group.map((sample) => sample.filterOpenMs)),
    maxCls: Math.max(...group.map((sample) => sample.cls)),
    pageErrors: group.reduce((count, sample) => count + sample.pageErrors, 0),
    maxFirstPartyRawBytes: Math.max(...group.map((sample) => sample.firstPartyRawBytes)),
    maxFirstPartyEncodedBytes: Math.max(...group.map((sample) => sample.firstPartyEncodedBytes)),
  };
});
const report = {
  measuredAt: new Date().toISOString(),
  url: target.href,
  browser: browser.version(),
  conditions: { mobileCpuSlowdown: 4, mobileRttMs: 150, mobileDownloadBytesPerSecond: 200000, cache: "disabled" },
  limitations:
    "Lab measurements, not field p75 or INP. Map container readiness does not certify all tiles loaded. LCP is observed until two seconds after map container and fonts are ready, before interaction.",
  summary,
  samples,
};
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, summary }, null, 2));
if (values["enforce-startup-byte-limits"]) {
  if (samples.some((sample) => !sample.scriptSizesAvailable || sample.pageErrors)) {
    throw new Error("Startup byte evidence is unavailable or the app has runtime errors");
  }
  applyByteLimitPolicy(
    summary.flatMap((row) => [
      {
        name: `${row.mobile ? "mobile" : "desktop"} first-visit first-party JS raw`,
        actualBytes: row.maxFirstPartyRawBytes,
        limitBytes: BUNDLE_SIZE_LIMITS.firstVisitRawBytes,
      },
      {
        name: `${row.mobile ? "mobile" : "desktop"} first-visit first-party JS encoded`,
        actualBytes: row.maxFirstPartyEncodedBytes,
        limitBytes: BUNDLE_SIZE_LIMITS.firstVisitEncodedBytes,
      },
    ]),
    { mode: BYTE_LIMIT_MODES.ENFORCE, onReport: (message) => console.warn(message) }
  );
}
if (
  values["enforce-lab-targets"] &&
  summary.some((row) => row.medianLcpMs <= 0 || row.medianLcpMs > 2500 || row.maxCls > 0.1 || row.pageErrors)
) {
  process.exitCode = 1;
}
