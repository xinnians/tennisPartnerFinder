import assert from "node:assert/strict";

export const BYTE_LIMIT_MODES = Object.freeze({
  ENFORCE: "enforce",
  REPORT: "report",
});

export const ENFORCE_BYTE_LIMITS_FLAG = "--enforce-byte-limits";
export const BUNDLE_WARNING_RATIO = 0.98;

export const BUNDLE_SIZE_LIMITS = Object.freeze({
  // September 9 production baseline: main 653,830 raw / 190,017 gzip.
  // Fixed maintenance ceilings, not an automatic percentage increase on each build.
  // Rationale and field/lab limits: docs/growth/performance-budget-2026-09-09.md.
  mainRawBytes: 680_000,
  mainGzipBytes: 200_000,
  // Include transitive static imports; moving code out of main must not hide startup growth.
  initialRawBytes: 700_000,
  initialGzipBytes: 205_000,
  // Cold anonymous visit through map/fonts readiness + 2 seconds; includes dynamic startup loads.
  firstVisitRawBytes: 820_000,
  firstVisitEncodedBytes: 260_000,
  // The largest ordinary lazy surface is 16,912/5,122; keep roughly 1 KiB/378 B for local maintenance.
  lazyRawBytes: 18_000,
  lazyGzipBytes: 5_500,
  // Sentry is intentionally isolated but substantially larger than application lazy chunks.
  sentryRawBytes: 90_000,
  sentryGzipBytes: 31_000,
  // Activated Push v2 owns encrypted enrollment, consent storage and cleanup.
  // It is lazy and receives its own budget; ordinary surfaces and initial JS
  // retain their existing limits. See the September 8 release acceptance.
  pushRawBytes: 75_000,
  pushGzipBytes: 17_000,
  // All first-party JS, including lazy chunks and the service worker.
  // Baseline 929,943 / 276,629; this is not the first-visit network payload.
  totalRawBytes: 1_000_000,
  totalGzipBytes: 300_000,
});

export function parseByteLimitMode(arguments_) {
  if (arguments_.length === 0) return BYTE_LIMIT_MODES.REPORT;
  assert.deepEqual(
    arguments_,
    [ENFORCE_BYTE_LIMITS_FLAG],
    `unsupported bundle checker arguments: ${arguments_.join(" ")}`
  );
  return BYTE_LIMIT_MODES.ENFORCE;
}

function formatByteLimitExcess({ actualBytes, limitBytes, name }) {
  return `${name}: ${actualBytes} bytes exceeds ${limitBytes} bytes by ${actualBytes - limitBytes}`;
}

export function applyByteLimitPolicy(checks, { mode, onReport = () => {} }) {
  assert.ok(Object.values(BYTE_LIMIT_MODES).includes(mode), `unsupported byte-limit mode: ${mode}`);
  for (const check of checks) {
    assert.equal(typeof check.name, "string", "byte-limit check must have a name");
    assert.ok(Number.isInteger(check.actualBytes) && check.actualBytes >= 0, `${check.name} has invalid bytes`);
    assert.ok(Number.isInteger(check.limitBytes) && check.limitBytes >= 0, `${check.name} has invalid limit`);
  }

  const excesses = checks.filter(({ actualBytes, limitBytes }) => actualBytes > limitBytes);
  for (const check of checks) {
    if (
      check.actualBytes <= check.limitBytes &&
      check.actualBytes >= Math.ceil(check.limitBytes * BUNDLE_WARNING_RATIO)
    ) {
      onReport(
        `bundle size approaching limit — ${check.name}: ${check.actualBytes}/${check.limitBytes} bytes (${check.limitBytes - check.actualBytes} remaining)`
      );
    }
  }
  if (mode === BYTE_LIMIT_MODES.ENFORCE && excesses.length > 0) {
    assert.fail(`production bundle byte limits exceeded:\n${excesses.map(formatByteLimitExcess).join("\n")}`);
  }
  if (mode === BYTE_LIMIT_MODES.REPORT) {
    for (const excess of excesses) onReport(`bundle size report only — ${formatByteLimitExcess(excess)}`);
  }
  return excesses;
}

/** Count each static dependency once, including shared/cyclic imports, but not dynamic imports. */
export function collectInitialJavaScriptChunks(chunks, entryNames) {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  assert.equal(byName.size, chunks.length, "duplicate JavaScript output filenames");
  assert.ok(entryNames.length > 0, "initial JavaScript needs an entry");
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    const chunk = byName.get(name);
    assert.ok(chunk, `unmeasured static JavaScript import: ${name}`);
    visited.add(name);
    for (const dependency of chunk.imports) visit(dependency);
  }
  entryNames.forEach(visit);
  return [...visited].map((name) => byName.get(name));
}

const normalizeModuleId = (moduleId) => moduleId.replaceAll("\\", "/");
const isSentryWrapper = (moduleId) => normalizeModuleId(moduleId).endsWith("/src/sentryBrowserSdk.ts");
const isSentryDependency = (moduleId) => normalizeModuleId(moduleId).includes("/node_modules/@sentry/");

export function identifySentryChunk(chunks) {
  const wrapperChunks = chunks.filter(({ facadeModuleId }) => facadeModuleId && isSentryWrapper(facadeModuleId));
  assert.equal(wrapperChunks.length, 1, `expected one Sentry wrapper chunk, found ${wrapperChunks.length}`);

  const dependencyChunks = chunks.filter(({ modules }) => Object.keys(modules).some(isSentryDependency));
  assert.equal(
    dependencyChunks.length,
    1,
    `expected all @sentry dependencies in one chunk, found ${dependencyChunks.length} chunks`
  );

  const [wrapperChunk] = wrapperChunks;
  assert.equal(
    dependencyChunks[0].fileName,
    wrapperChunk.fileName,
    "Sentry wrapper and @sentry dependencies must share one isolated chunk"
  );

  const moduleIds = Object.keys(wrapperChunk.modules);
  assert.ok(moduleIds.some(isSentryWrapper), "Sentry wrapper chunk does not contain its facade module");
  assert.ok(moduleIds.some(isSentryDependency), "Sentry wrapper chunk contains no @sentry dependency");
  const unexpectedModules = moduleIds.filter((moduleId) => !isSentryWrapper(moduleId) && !isSentryDependency(moduleId));
  assert.deepEqual(
    unexpectedModules,
    [],
    `Sentry chunk contains application or unrelated modules: ${unexpectedModules.join(", ")}`
  );
  assert.deepEqual(wrapperChunk.imports, [], "Sentry chunk must not statically import another chunk");
  assert.deepEqual(wrapperChunk.dynamicImports, [], "Sentry chunk must not dynamically import another chunk");
  return wrapperChunk;
}
