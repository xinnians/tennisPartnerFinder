import assert from "node:assert/strict";

export const BYTE_LIMIT_MODES = Object.freeze({
  ENFORCE: "enforce",
  REPORT: "report",
});

export const ENFORCE_BYTE_LIMITS_FLAG = "--enforce-byte-limits";

export const BUNDLE_SIZE_LIMITS = Object.freeze({
  // F4-3 emits 654,771 raw / 191,396 gzip after authenticated repositories become conditional.
  // One 4 KiB raw / 1 KiB gzip maintenance window keeps the budget below the prior 661,080/192,693 bundle.
  mainRawBytes: 658_867,
  mainGzipBytes: 192_420,
  // The largest ordinary lazy surface is 16,912/5,122; keep roughly 1 KiB/378 B for local maintenance.
  lazyRawBytes: 18_000,
  lazyGzipBytes: 5_500,
  // Sentry is intentionally isolated but substantially larger than application lazy chunks.
  sentryRawBytes: 90_000,
  sentryGzipBytes: 31_000,
  // F4-3 total JS (including push-sw.js) is 841,545/256,497. A 1% ceiling prevents split-induced growth.
  totalRawBytes: 849_961,
  totalGzipBytes: 259_062,
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
  if (mode === BYTE_LIMIT_MODES.ENFORCE && excesses.length > 0) {
    assert.fail(`production bundle byte limits exceeded:\n${excesses.map(formatByteLimitExcess).join("\n")}`);
  }
  if (mode === BYTE_LIMIT_MODES.REPORT) {
    for (const excess of excesses) onReport(`bundle size report only — ${formatByteLimitExcess(excess)}`);
  }
  return excesses;
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
