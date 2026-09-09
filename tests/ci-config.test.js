import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { build as buildVite } from "vite";

import { createPlaywrightConfig } from "../playwright.config.js";
import productionPreviewConfig from "../playwright.preview.config.js";
import {
  createPushCleanupPublicKeyAssetPlugin,
  createPushCleanupPublicKeyAssetSource,
  PUSH_CLEANUP_PUBLIC_JWK_ENV,
  PUSH_CLEANUP_PUBLIC_KEY_ASSET,
  PUSH_CLEANUP_PUBLIC_KEY_PATH,
} from "../scripts/pushCleanupPublicKeyAsset.mjs";
import {
  createPushSubscriptionPublicKeyAssetPlugin,
  createPushSubscriptionPublicKeyAssetSource,
  PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_ASSET,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH,
} from "../scripts/pushSubscriptionPublicKeyAsset.mjs";
import {
  applyByteLimitPolicy,
  BYTE_LIMIT_MODES,
  ENFORCE_BYTE_LIMITS_FLAG,
  collectInitialJavaScriptChunks,
  identifySentryChunk,
  parseByteLimitMode,
} from "../scripts/productionBundlePolicy.mjs";
import createViteConfig from "../vite.config.ts";

const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const PACKAGE_LOCK = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const NVMRC = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const WORKFLOW = readFileSync(new URL("../.github/workflows/quality-gate.yml", import.meta.url), "utf8");
const PERFORMANCE_SPEC = readFileSync(new URL("./performance.spec.js", import.meta.url), "utf8");
const PRODUCTION_BUNDLE_CHECKER = readFileSync(
  new URL("../scripts/check-production-bundle.mjs", import.meta.url),
  "utf8"
);
const PRODUCTION_PREVIEW_BUILD = readFileSync(
  new URL("../scripts/build-production-preview.mjs", import.meta.url),
  "utf8"
);
const PRODUCTION_PREVIEW_FIXTURE = readFileSync(new URL("./fixtures/productionPreview.js", import.meta.url), "utf8");
const PRODUCTION_PREVIEW_SPEC = readFileSync(new URL("./production-preview.spec.js", import.meta.url), "utf8");
const FAKE_MAPS = readFileSync(new URL("./fixtures/fakeMaps.js", import.meta.url), "utf8");
const SMOKE_SPECS = readdirSync(new URL("./", import.meta.url))
  .filter((name) => name.endsWith("-smoke.spec.js"))
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
  .join("\n");
const DEVELOPMENT_BRANCH = "claude/tennis-partner-finder-proto-xfrr6g";
const REQUIRED_NODE_VERSION = [22, 18, 0];
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const RFC_7638_RSA_MODULUS =
  "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw";
const CLEANUP_PUBLIC_JWK = Object.freeze({
  alg: "RSA-OAEP-256",
  e: "AQAB",
  ext: true,
  key_ops: ["encrypt"],
  kid: "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs",
  kty: "RSA",
  n: RFC_7638_RSA_MODULUS,
});
const SERIALIZED_CLEANUP_PUBLIC_JWK = JSON.stringify(CLEANUP_PUBLIC_JWK);
const SUBSCRIPTION_PUBLIC_JWK = Object.freeze({
  alg: "RSA-OAEP-256",
  e: "AQAB",
  ext: true,
  key_ops: ["encrypt"],
  kid: "RNdz7elerOjBYA4WWMBFEEfaE5SASprbbETl9VmTVv8",
  kty: "RSA",
  n: "zJYuOqckRC96aTybzarS09v-SAvx_Jc1EREjmY8Vj8Zhaw1ZOVP-JWCxem41czvLpD8kiJAXkXvuIP4dA3MChvVoGU5ZD7kjtwj6L-7fISpxsa6iaPdNu8rUHtddrlHRkzXVbMNboL4Z1Klbyz0b5fqLCQdPTGcxqLhA36nnrkYLKxQPAPr641QNdfJkmgY7lFT-oMHHLP4pPSMVaH3ZhNCLcekY-GxwyuGrp1B1E9nFtrJ7wbEwJneHNXB6-Wr-Vc6yCA8yk9t9uTYH33XoxriqmINCn_xQqkwJsN49skSI49fXg8gkhy5mFO04H6M-BU_v2taszzpKsXY83RebgQ",
});
const SERIALIZED_SUBSCRIPTION_PUBLIC_JWK = JSON.stringify(SUBSCRIPTION_PUBLIC_JWK);

const scriptCommands = (name) => PACKAGE.scripts[name].split("&&").map((command) => command.trim());

function parseMinimumNodeVersion(range) {
  const match = /^>=(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range);
  assert.ok(match, `Node engine must be a single inclusive lower bound, received: ${range}`);
  return match.slice(1).map((part) => Number(part ?? 0));
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function workflowJob(name) {
  const marker = `\n  ${name}:\n`;
  const start = WORKFLOW.indexOf(marker);
  assert.ok(start >= 0, `workflow job missing: ${name}`);
  const tail = WORKFLOW.slice(start + marker.length);
  // eslint-disable-next-line no-regex-spaces -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  const nextJob = tail.search(/\n  [a-z][\w-]*:\n/);
  return nextJob < 0 ? tail : tail.slice(0, nextJob);
}

function assertWorkflowDevelopmentBranchFilters(workflow) {
  const branchFilters = [...workflow.matchAll(/^ {4}branches: \[(.+)]$/gm)].map((match) =>
    match[1].split(",").map((branch) => branch.trim())
  );
  assert.equal(branchFilters.length, 2, "workflow must keep exactly the push and pull-request branch filters");
  for (const branches of branchFilters) {
    assert.deepEqual(branches, ["main", DEVELOPMENT_BRANCH]);
  }
  assert.equal(
    workflow.split(DEVELOPMENT_BRANCH).length - 1,
    branchFilters.length,
    "development branch may appear only in the guarded branch filters"
  );
}

function assertProductionPreviewConfig(config, packageJson = PACKAGE) {
  assert.equal(
    packageJson.scripts["test:preview"],
    "npm run build:preview-test && playwright test --config=playwright.preview.config.js"
  );
  assert.equal(packageJson.scripts["build:preview-test"], "node scripts/build-production-preview.mjs");
  assert.equal(
    packageJson.scripts["test:preview:chromium"],
    "npm run build:preview-test && playwright test --config=playwright.preview.config.js --project=preview-desktop-chromium --project=preview-mobile-chromium"
  );
  assert.equal(
    packageJson.scripts["test:preview:webkit"],
    "npm run build:preview-test && playwright test --config=playwright.preview.config.js --project=preview-mobile-webkit"
  );
  assert.equal(config.workers, 1);
  assert.equal(config.webServer.command, "node scripts/serve-production-preview.mjs");
  assert.equal(config.webServer.reuseExistingServer, false);
  assert.deepEqual(
    config.projects.map(({ name }) => name),
    ["preview-desktop-chromium", "preview-mobile-chromium", "preview-mobile-webkit"]
  );
  assert.ok(config.projects[0].testMatch.test("production-preview.spec.js"));
  for (const project of config.projects.slice(1)) {
    assert.ok(project.testMatch.test("production-preview-mobile.spec.js"));
    assert.deepEqual(project.use.viewport, { height: 844, width: 390 });
  }
}

test("Node runtime declarations require 22.18 or newer and stay semantically aligned", () => {
  const minimum = parseMinimumNodeVersion(PACKAGE.engines?.node);
  assert.ok(compareVersions(minimum, REQUIRED_NODE_VERSION) >= 0, "Node engine minimum must be at least 22.18");
  assert.match(NVMRC, /^\d+$/u, ".nvmrc must select one maintained Node major");
  assert.equal(Number(NVMRC), minimum[0], ".nvmrc major must match the package engine lower bound");
  assert.equal(PACKAGE_LOCK.packages[""].engines?.node, PACKAGE.engines.node);
});

test("quality workflow runs for main and the current development branch", () => {
  assert.ok(WORKFLOW.length > 1_000, "quality workflow is unexpectedly small");
  assertWorkflowDevelopmentBranchFilters(WORKFLOW);
  assert.match(WORKFLOW, /workflow_dispatch:/);
});

test("quality workflow branch guard fails closed when one filter drifts", () => {
  const driftedWorkflow = WORKFLOW.replace(DEVELOPMENT_BRANCH, "canary/branch-filter-drift");
  assert.throws(() => assertWorkflowDevelopmentBranchFilters(driftedWorkflow));
  assert.doesNotThrow(() => assertWorkflowDevelopmentBranchFilters(WORKFLOW));
});

test("frontend CI script contains every current non-database gate in order", () => {
  const commands = scriptCommands("test:ci:frontend");
  const gates = [
    "node scripts/generate-courts-seed.mjs --check",
    "npm run check:design-system",
    "npm run typecheck",
    "npm run lint",
    "npm run prettier:check",
    "npm run test:mock",
    "npm run build",
    "npm run check:production-bundle",
    "git diff --check",
  ];
  assert.deepEqual(commands, gates);
  assert.match(WORKFLOW, /run: npm run test:ci:frontend/);
});

test("design-system artifacts have explicit sync and check commands", () => {
  assert.equal(PACKAGE.scripts["sync:design-system"], "node scripts/designSystemBundle.mjs --write");
  assert.equal(PACKAGE.scripts["check:design-system"], "node scripts/designSystemBundle.mjs --check");
  assert.deepEqual(scriptCommands("pretest"), [
    "node scripts/generate-courts-seed.mjs --check",
    "npm run check:design-system",
  ]);
  assert.match(PACKAGE.scripts["test:session-unit"], /tests\/design-system-bundle\.test\.js/u);
});

test("development bundle checks report byte excesses while release checks enforce them", () => {
  assert.equal(PACKAGE.scripts["check:production-bundle"], "node scripts/check-production-bundle.mjs");
  assert.equal(
    PACKAGE.scripts["check:production-bundle:release"],
    `npm run build && node scripts/check-production-bundle.mjs ${ENFORCE_BYTE_LIMITS_FLAG}`
  );
  assert.equal(parseByteLimitMode([]), BYTE_LIMIT_MODES.REPORT);
  assert.equal(parseByteLimitMode([ENFORCE_BYTE_LIMITS_FLAG]), BYTE_LIMIT_MODES.ENFORCE);
  assert.throws(() => parseByteLimitMode(["--unknown"]), /unsupported bundle checker arguments/);

  const checks = [
    { actualBytes: 10, limitBytes: 10, name: "at limit" },
    { actualBytes: 12, limitBytes: 10, name: "over limit" },
  ];
  const reports = [];
  assert.deepEqual(
    applyByteLimitPolicy(checks, { mode: BYTE_LIMIT_MODES.REPORT, onReport: (message) => reports.push(message) }),
    [checks[1]]
  );
  assert.deepEqual(reports, [
    "bundle size approaching limit — at limit: 10/10 bytes (0 remaining)",
    "bundle size report only — over limit: 12 bytes exceeds 10 bytes by 2",
  ]);
  assert.throws(
    () => applyByteLimitPolicy(checks, { mode: BYTE_LIMIT_MODES.ENFORCE }),
    /production bundle byte limits exceeded:[\s\S]*over limit/
  );
  assert.deepEqual(
    applyByteLimitPolicy([checks[0]], { mode: BYTE_LIMIT_MODES.ENFORCE }),
    [],
    "the exact limit must remain valid"
  );
});

test("bundle near-limit warnings preserve release success and exact hard limits", () => {
  for (const mode of Object.values(BYTE_LIMIT_MODES)) {
    const reports = [];
    const checks = [979, 980, 1000].map((actualBytes) => ({
      actualBytes,
      limitBytes: 1000,
      name: `size ${actualBytes}`,
    }));
    assert.deepEqual(applyByteLimitPolicy(checks, { mode, onReport: (message) => reports.push(message) }), []);
    assert.equal(reports.length, 2);
    assert.match(reports[0], /980\/1000 bytes \(20 remaining\)/u);
    assert.match(reports[1], /1000\/1000 bytes \(0 remaining\)/u);
  }
});

test("initial JS follows static dependency graphs once and excludes dynamic-only entries", () => {
  const chunks = [
    { fileName: "main.js", imports: ["a.js", "b.js"], dynamicImports: ["lazy.js"] },
    { fileName: "a.js", imports: ["shared.js"], dynamicImports: [] },
    { fileName: "b.js", imports: ["shared.js"], dynamicImports: [] },
    { fileName: "shared.js", imports: ["main.js"], dynamicImports: [] },
    { fileName: "lazy.js", imports: [], dynamicImports: [] },
  ];
  const initial = collectInitialJavaScriptChunks(chunks, ["main.js"]);
  assert.deepEqual(initial.map((chunk) => chunk.fileName).sort(), ["a.js", "b.js", "main.js", "shared.js"]);
  assert.throws(() => collectInitialJavaScriptChunks(chunks.slice(0, 3), ["main.js"]), /unmeasured static/u);
  assert.throws(() => collectInitialJavaScriptChunks([...chunks, chunks[0]], ["main.js"]), /duplicate/u);
  assert.throws(() => collectInitialJavaScriptChunks(chunks, []), /needs an entry/u);
  assert.throws(
    () =>
      applyByteLimitPolicy([{ name: "initial total", actualBytes: initial.length * 30, limitBytes: 100 }], {
        mode: BYTE_LIMIT_MODES.ENFORCE,
      }),
    /initial total/u,
    "splitting startup code into individually small files does not bypass the aggregate limit"
  );
});

test("bundle reports Brotli alongside raw and gzip without inventing a development limit", () => {
  assert.match(PRODUCTION_BUNDLE_CHECKER, /import \{ brotliCompressSync, gzipSync \} from "node:zlib"/);
  assert.match(PRODUCTION_BUNDLE_CHECKER, /sizes raw\/gzip\/brotli/);
  assert.doesNotMatch(PRODUCTION_BUNDLE_CHECKER, /BROTLI_LIMIT/u);
});

test("Sentry size allowance follows Vite module provenance instead of a text marker", () => {
  const wrapper = {
    code: "sentry_version",
    dynamicImports: [],
    facadeModuleId: "/repo/src/sentryBrowserSdk.ts",
    fileName: "assets/sentry.js",
    imports: [],
    modules: {
      "/repo/node_modules/@sentry/browser/build/npm/esm/index.js": {},
      "/repo/src/sentryBrowserSdk.ts": {},
    },
  };
  const ordinaryMarkerChunk = {
    code: "sentry_version",
    facadeModuleId: "/repo/src/views/ordinary.ts",
    fileName: "assets/ordinary.js",
    modules: { "/repo/src/views/ordinary.ts": {} },
  };
  assert.equal(identifySentryChunk([ordinaryMarkerChunk, wrapper]), wrapper);
  assert.throws(
    () =>
      identifySentryChunk([
        wrapper,
        {
          facadeModuleId: "/repo/src/other.ts",
          fileName: "assets/other-sentry.js",
          modules: { "/repo/node_modules/@sentry/core/build/index.js": {} },
        },
      ]),
    /expected all @sentry dependencies in one chunk/
  );
  assert.throws(
    () =>
      identifySentryChunk([
        {
          ...wrapper,
          modules: { ...wrapper.modules, "/repo/src/unrelatedApplication.ts": {} },
        },
      ]),
    /Sentry chunk contains application or unrelated modules/
  );
  assert.throws(
    () => identifySentryChunk([{ ...wrapper, imports: ["assets/unrelated-app.js"] }]),
    /Sentry chunk must not statically import another chunk/
  );
  assert.throws(
    () => identifySentryChunk([{ ...wrapper, dynamicImports: ["assets/unrelated-app.js"] }]),
    /Sentry chunk must not dynamically import another chunk/
  );
});

test("lint and Prettier cover source, test, script, and executable root configuration files", () => {
  assert.equal(
    PACKAGE.scripts.lint,
    'eslint "src/**/*.{js,ts,tsx}" "supabase/functions/{_shared,push-cleanup,push-subscription-v2,notification-dispatch-v2-canary,notification-outbox-dispatch-v2,notification-outbox-dispatch-v2-canary}/**/*.{js,ts}" "supabase/functions/notification-outbox-dispatch/*.{js,ts}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js playwright.preview.config.js vite.config.ts "server/**/*.js" "api/**/*.js"'
  );
  assert.equal(
    PACKAGE.scripts["prettier:check"],
    'prettier --check "src/**/*.{js,ts,tsx}" "supabase/functions/{_shared,push-cleanup,push-subscription-v2,notification-dispatch-v2-canary,notification-outbox-dispatch-v2,notification-outbox-dispatch-v2-canary}/**/*.{js,ts}" "supabase/functions/notification-outbox-dispatch/*.{js,ts}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js playwright.preview.config.js vite.config.ts package.json package-lock.json tsconfig.json vercel.json "server/**/*.js" "api/**/*.js"'
  );
});

test("production preview runs a real production bundle against local-only integrations", () => {
  assertProductionPreviewConfig(productionPreviewConfig);
  assert.match(PRODUCTION_PREVIEW_BUILD, /loadLocalSupabaseConfig\(\)/);
  for (const safeOverride of [
    'PUSH_CLEANUP_PUBLIC_JWK_JSON: ""',
    'PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON: ""',
    'VITE_SENTRY_DSN: ""',
    'VITE_WEB_PUSH_VAPID_PUBLIC_KEY: ""',
  ]) {
    assert.ok(PRODUCTION_PREVIEW_BUILD.includes(safeOverride), `preview build misses safe override: ${safeOverride}`);
  }
  assert.match(PRODUCTION_PREVIEW_BUILD, /await build\(\{ mode: "production" \}\)/);
});

test("production preview config canary fails when a required browser project disappears", () => {
  assert.throws(() => assertProductionPreviewConfig({ ...productionPreviewConfig, projects: [] }));
});

test("production private-chunk assertion has an authenticated positive control", () => {
  assert.doesNotMatch(PERFORMANCE_SPEC, /src\/data\/repositories\/privateDataRepository\.ts/);
  assert.match(PRODUCTION_PREVIEW_FIXTURE, /tennis_private_data_repository_v1/);
  assert.ok(
    (PRODUCTION_PREVIEW_SPEC.match(/installPrivateDataChunkProbe\(page\)/g) ?? []).length >= 2,
    "anonymous and authenticated cases must use the same production marker probe"
  );
  assert.match(PRODUCTION_PREVIEW_SPEC, /privateChunkRequests\.length\)\.toBeGreaterThan\(0\)/);
});

test("ESLint applies real JS and TypeScript rules to Push Edge and dispatcher boundaries", async () => {
  const eslint = new ESLint({ cwd: REPOSITORY_ROOT });
  const [
    sharedConfig,
    javascriptConfig,
    subscriptionConfig,
    dispatcherConfig,
    outcomeConfig,
    typescriptConfig,
    dispatcherDatabaseConfig,
  ] = await Promise.all([
    eslint.calculateConfigForFile("supabase/functions/_shared/push-cleanup-protocol.js"),
    eslint.calculateConfigForFile("supabase/functions/push-cleanup/crypto.js"),
    eslint.calculateConfigForFile("supabase/functions/push-subscription-v2/crypto.js"),
    eslint.calculateConfigForFile("supabase/functions/notification-outbox-dispatch/v2-egress.js"),
    eslint.calculateConfigForFile("supabase/functions/notification-outbox-dispatch/v2-outcome.js"),
    eslint.calculateConfigForFile("supabase/functions/push-cleanup/index.ts"),
    eslint.calculateConfigForFile("supabase/functions/notification-outbox-dispatch/v2-database.ts"),
  ]);

  assert.equal(sharedConfig?.rules?.["no-undef"]?.[0], 2);
  assert.equal(javascriptConfig?.rules?.["no-undef"]?.[0], 2);
  assert.equal(subscriptionConfig?.rules?.["no-undef"]?.[0], 2);
  assert.equal(dispatcherConfig?.rules?.["no-undef"]?.[0], 2);
  assert.equal(outcomeConfig?.rules?.["no-undef"]?.[0], 2);
  assert.equal(typescriptConfig?.languageOptions?.parser?.meta?.name, "typescript-eslint/parser");
  assert.equal(typescriptConfig?.rules?.["@typescript-eslint/no-unused-vars"]?.[0], 2);
  assert.equal(dispatcherDatabaseConfig?.languageOptions?.parser?.meta?.name, "typescript-eslint/parser");
  assert.equal(dispatcherDatabaseConfig?.rules?.["@typescript-eslint/no-unused-vars"]?.[0], 2);
});

test("the session unit aggregate registers every top-level unit test except the local API suite", () => {
  const localOnly = "session-data-local-api.test.js";
  const expected = readdirSync(new URL("./", import.meta.url))
    .filter((name) => name.endsWith(".test.js") && name !== localOnly)
    .map((name) => `tests/${name}`)
    .sort();
  const registered = (PACKAGE.scripts["test:session-unit"].match(/tests\/[^ ]+\.test\.js/g) ?? []).sort();
  assert.deepEqual(registered, expected);
  assert.match(PACKAGE.scripts["test:local"], new RegExp(`tests/${localOnly.replaceAll(".", "\\.")}`));
});

test("both mock Chromium projects execute dedicated runtime safety specs", () => {
  const config = createPlaywrightConfig();
  for (const name of ["desktop-chromium", "mobile-chromium"]) {
    const project = config.projects.find((candidate) => candidate.name === name);
    assert.ok(project?.testMatch.test("error-boundary.spec.js"), `${name} silently excludes the boundary gate`);
    assert.ok(project?.testMatch.test("react-unmount.spec.js"), `${name} silently excludes the unmount gate`);
    assert.ok(project?.testMatch.test("react-page-focus.spec.js"), `${name} silently excludes the page-focus gate`);
    assert.ok(project?.testMatch.test("auth-lock.spec.js"), `${name} silently excludes the auth-lock gate`);
    assert.ok(project?.testMatch.test("push-storage.spec.js"), `${name} silently excludes the Push storage gate`);
    assert.ok(
      project?.testMatch.test("push-cleanup-transport.spec.js"),
      `${name} silently excludes the Push cleanup transport gate`
    );
    assert.ok(
      project?.testMatch.test("push-subscription-v2-protocol.spec.js"),
      `${name} silently excludes the Push subscription v2 protocol gate`
    );
    assert.ok(
      project?.testMatch.test("push-subscription-transport.spec.js"),
      `${name} silently excludes the Push subscription transport gate`
    );
    assert.ok(
      project?.testMatch.test("push-subscription-composition.spec.js"),
      `${name} silently excludes the Push subscription composition gate`
    );
  }
});

test("mock projects use bounded parallelism while local projects remain single-worker", () => {
  assert.equal(createPlaywrightConfig({ mode: "mock" }).workers, 4);
  const local = createPlaywrightConfig({
    mode: "local",
    loadLocalSupabaseConfig: () => ({ apiUrl: "http://127.0.0.1:54321", publicKey: "test-key" }),
  });
  assert.equal(local.workers, 1);
});

test("browser fixtures intercept every Google-hosted avatar without bypassing fallback assertions", () => {
  assert.match(FAKE_MAPS, /page\.route\("https:\/\/lh\*\.googleusercontent\.com\/\*\*"/);
  assert.match(FAKE_MAPS, /contentType: "image\/png"/);
  assert.match(SMOKE_SPECS, /dispatchEvent\("error"\)/);
});

test("browser Maps fixtures exercise the AdvancedMarker property contract", () => {
  assert.match(FAKE_MAPS, /class AdvancedMarkerElement/);
  assert.match(FAKE_MAPS, /this\.content = content/);
  assert.match(FAKE_MAPS, /set map\(map\)/);
  assert.match(FAKE_MAPS, /set position\(position\)/);
  assert.equal(createPlaywrightConfig().webServer.env.VITE_GOOGLE_MAPS_MAP_ID, "DEMO_MAP_ID");
});

test("production alias excludes mockData through every relative import shape", () => {
  assert.equal(typeof createViteConfig, "function");
  const production = createViteConfig({ command: "build", mode: "production" });
  assert.equal(production.define?.__TENNIS_E2E_TEST_HOOKS__, "false");
  assert.ok(
    production.plugins?.some((plugin) => plugin?.name === "tennis-push-cleanup-public-key"),
    "Vite config must keep the cleanup public-key publisher installed"
  );
  assert.ok(
    production.plugins?.some((plugin) => plugin?.name === "tennis-push-subscription-public-key"),
    "Vite config must keep the subscription public-key publisher installed"
  );
  const aliases = production.resolve?.alias;
  assert.equal(aliases?.length, 1);
  const [{ find, replacement }] = aliases;
  for (const specifier of [
    "mockData.js",
    "./mockData.js",
    "../mockData.js",
    "../../src/mockData.js",
    "/src/mockData.js",
  ]) {
    assert.ok(find.test(specifier), `production mock alias misses ${specifier}`);
  }
  assert.equal(find.test("./mockData.empty.js"), false);
  assert.match(replacement, /\/src\/mockData\.empty\.js$/);

  const development = createViteConfig({ command: "serve", mode: "development" });
  assert.equal(development.define?.__TENNIS_E2E_TEST_HOOKS__, "true");
  assert.equal(development.resolve, undefined, "development and mock harness must retain the full fixture");
});

test("Vite emits only the canonical rotatable cleanup public-key document when configured", async () => {
  async function buildWithPublicKey(serializedPublicJwk) {
    const virtualEntry = "\0cleanup-public-key-test-entry";
    const result = await buildVite({
      build: {
        rollupOptions: { input: virtualEntry },
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          load(id) {
            return id === virtualEntry ? "export const cleanupKeyAssetTest = true;" : null;
          },
          name: "cleanup-public-key-test-entry",
          resolveId(id) {
            return id === virtualEntry ? virtualEntry : null;
          },
        },
        createPushCleanupPublicKeyAssetPlugin(serializedPublicJwk),
      ],
    });
    assert.equal(Array.isArray(result), false);
    return result.output;
  }

  const expectedSource = await createPushCleanupPublicKeyAssetSource(SERIALIZED_CLEANUP_PUBLIC_JWK);
  const configuredOutput = await buildWithPublicKey(SERIALIZED_CLEANUP_PUBLIC_JWK);
  const keyAsset = configuredOutput.find(
    (output) => output.type === "asset" && output.fileName === PUSH_CLEANUP_PUBLIC_KEY_ASSET
  );
  assert.ok(keyAsset, "configured build did not emit the cleanup public-key asset");
  assert.equal(String(keyAsset.source), expectedSource);

  const javascript = configuredOutput
    .filter((output) => output.type === "chunk")
    .map(({ code }) => code)
    .join("\n");
  for (const forbidden of [
    CLEANUP_PUBLIC_JWK.kid,
    CLEANUP_PUBLIC_JWK.n,
    PUSH_CLEANUP_PUBLIC_JWK_ENV,
    "PUSH_CLEANUP_PRIVATE_JWKS_JSON",
  ]) {
    assert.equal(javascript.includes(forbidden), false, `JavaScript chunk contains build-only key data: ${forbidden}`);
  }

  const unconfiguredOutput = await buildWithPublicKey("");
  assert.equal(
    unconfiguredOutput.some((output) => output.fileName === PUSH_CLEANUP_PUBLIC_KEY_ASSET),
    false,
    "an unconfigured build must not publish a placeholder key"
  );
});

test("Vite reads the public-only cleanup env without defining it in browser JavaScript", async () => {
  const previous = process.env[PUSH_CLEANUP_PUBLIC_JWK_ENV];
  process.env[PUSH_CLEANUP_PUBLIC_JWK_ENV] = SERIALIZED_CLEANUP_PUBLIC_JWK;
  try {
    const config = createViteConfig({ command: "build", mode: "production" });
    assert.equal(Object.hasOwn(config.define ?? {}, PUSH_CLEANUP_PUBLIC_JWK_ENV), false);
    const plugin = config.plugins?.find((candidate) => candidate?.name === "tennis-push-cleanup-public-key");
    assert.equal(typeof plugin?.generateBundle, "function");

    const emitted = [];
    await plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });
    assert.deepEqual(emitted, [
      {
        fileName: PUSH_CLEANUP_PUBLIC_KEY_ASSET,
        source: await createPushCleanupPublicKeyAssetSource(SERIALIZED_CLEANUP_PUBLIC_JWK),
        type: "asset",
      },
    ]);
  } finally {
    if (previous === undefined) delete process.env[PUSH_CLEANUP_PUBLIC_JWK_ENV];
    else process.env[PUSH_CLEANUP_PUBLIC_JWK_ENV] = previous;
  }
});

test("cleanup public-key build config fails closed on non-canonical or private input", async () => {
  const parsed = JSON.parse(SERIALIZED_CLEANUP_PUBLIC_JWK);
  for (const invalid of [
    `${SERIALIZED_CLEANUP_PUBLIC_JWK}\n`,
    JSON.stringify({ ...parsed, d: "AQ" }),
    JSON.stringify({ ...parsed, kid: "A".repeat(43) }),
  ]) {
    await assert.rejects(createPushCleanupPublicKeyAssetSource(invalid), /PUBLIC_KEY_INVALID/);
  }
  assert.equal(await createPushCleanupPublicKeyAssetSource(""), null);
});

test("cleanup public-key dev middleware serves only the fixed path without caching", async () => {
  const plugin = createPushCleanupPublicKeyAssetPlugin(SERIALIZED_CLEANUP_PUBLIC_JWK);
  let middleware = null;
  await plugin.configureServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  assert.equal(typeof middleware, "function");

  const headers = new Map();
  let body = null;
  let nextCalls = 0;
  middleware(
    { method: "GET", url: PUSH_CLEANUP_PUBLIC_KEY_PATH },
    {
      end(value) {
        body = value;
      },
      setHeader(name, value) {
        headers.set(name.toLowerCase(), value);
      },
    },
    () => {
      nextCalls += 1;
    }
  );
  assert.equal(nextCalls, 0);
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.get("pragma"), "no-cache");
  assert.equal(headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(body, await createPushCleanupPublicKeyAssetSource(SERIALIZED_CLEANUP_PUBLIC_JWK));

  middleware({ method: "GET", url: `${PUSH_CLEANUP_PUBLIC_KEY_PATH}?alias=1` }, { end() {}, setHeader() {} }, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1, "query aliases must not become another key publication URL");
});

test("subscription public-key publisher uses its own path and environment contract", async () => {
  assert.equal(PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH, "/push-subscription-key-v1.json");
  assert.equal(PUSH_SUBSCRIPTION_PUBLIC_KEY_ASSET, "push-subscription-key-v1.json");
  assert.equal(PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV, "PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON");
  const source = await createPushSubscriptionPublicKeyAssetSource(SERIALIZED_SUBSCRIPTION_PUBLIC_JWK);
  assert.equal(new TextEncoder().encode(source).byteLength, 499);
  assert.notEqual(SUBSCRIPTION_PUBLIC_JWK.kid, CLEANUP_PUBLIC_JWK.kid);

  const plugin = createPushSubscriptionPublicKeyAssetPlugin(SERIALIZED_SUBSCRIPTION_PUBLIC_JWK);
  const emitted = [];
  await plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });
  assert.deepEqual(emitted, [{ fileName: PUSH_SUBSCRIPTION_PUBLIC_KEY_ASSET, source, type: "asset" }]);
  assert.equal(await createPushSubscriptionPublicKeyAssetSource(""), null);
  await assert.rejects(createPushSubscriptionPublicKeyAssetSource(`${SERIALIZED_SUBSCRIPTION_PUBLIC_JWK}\n`));
  await assert.rejects(
    createPushSubscriptionPublicKeyAssetSource(JSON.stringify({ ...SUBSCRIPTION_PUBLIC_JWK, d: "AQ" }))
  );
  const publisherSource = readFileSync(
    new URL("../scripts/pushSubscriptionPublicKeyAsset.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(publisherSource, /pushCleanup|PUSH_CLEANUP/u);
});

test("Vite keeps subscription public-key data in the build boundary, outside browser definitions", async () => {
  const previous = process.env[PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV];
  process.env[PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV] = SERIALIZED_SUBSCRIPTION_PUBLIC_JWK;
  try {
    const config = createViteConfig({ command: "build", mode: "production" });
    assert.equal(Object.hasOwn(config.define ?? {}, PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV), false);
    const plugin = config.plugins?.find((candidate) => candidate?.name === "tennis-push-subscription-public-key");
    assert.equal(typeof plugin?.generateBundle, "function");
    const emitted = [];
    await plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });
    assert.deepEqual(emitted, [
      {
        fileName: PUSH_SUBSCRIPTION_PUBLIC_KEY_ASSET,
        source: await createPushSubscriptionPublicKeyAssetSource(SERIALIZED_SUBSCRIPTION_PUBLIC_JWK),
        type: "asset",
      },
    ]);
  } finally {
    if (previous === undefined) delete process.env[PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV];
    else process.env[PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV] = previous;
  }
});

test("Supabase CI owns reset, pgTAP, desktop, and mobile browser journeys", () => {
  const supabaseJob = workflowJob("supabase");
  assert.equal(
    PACKAGE.scripts["test:local:mobile"],
    "TENNIS_TEST_HARNESS_MODE=local playwright test --project=supabase-mobile-chromium"
  );
  assert.equal(
    PACKAGE.scripts["test:local:push-cleanup-edge"],
    "RUN_LOCAL_PUSH_CLEANUP_EDGE_TEST=1 node --test --test-concurrency=1 tests/push-cleanup-edge-local.test.js"
  );
  assert.equal(
    PACKAGE.scripts["test:local:push-subscription-v2-edge"],
    "RUN_LOCAL_PUSH_SUBSCRIPTION_V2_EDGE_TEST=1 node --test --test-concurrency=1 tests/push-subscription-v2-edge-local.test.js"
  );
  assert.equal(
    PACKAGE.scripts["test:local:notification-dispatch-v2-edge"],
    "RUN_LOCAL_NOTIFICATION_DISPATCH_V2_CANARY_TEST=1 node --test --test-concurrency=1 tests/notification-dispatch-v2-edge-local.test.js"
  );
  assert.equal(
    PACKAGE.scripts["test:local:notification-outbox-dispatch-v2-edge"],
    "RUN_LOCAL_NOTIFICATION_OUTBOX_DISPATCH_V2_EDGE_TEST=1 node --test --test-concurrency=1 tests/notification-outbox-dispatch-v2-edge-local.test.js"
  );
  assert.deepEqual(scriptCommands("test:ci:supabase"), [
    "node scripts/generate-courts-seed.mjs --check",
    "npm run test:db",
    "npm run test:local",
    "npm run test:local:mobile",
    "npm run test:preview:chromium",
    "npm run test:local:push-cleanup-edge",
    "npm run test:local:push-subscription-v2-edge",
    "npm run test:local:notification-dispatch-v2-edge",
    "npm run test:local:notification-outbox-dispatch-v2-edge",
    "git diff --check",
  ]);
  assert.match(supabaseJob, /run: npm run test:ci:supabase/);
  assert.match(supabaseJob, /npx playwright install --with-deps chromium/);
  assert.doesNotMatch(supabaseJob, /playwright install --with-deps chromium webkit/);
  assert.match(supabaseJob, /CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test/);
  assert.match(supabaseJob, /if: always\(\)[\s\S]*npx supabase stop --no-backup/);
  const orderedCommands = [
    "npx supabase start",
    "CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test",
    "npm run test:ci:supabase",
    "npx supabase stop --no-backup",
  ].map((command) => supabaseJob.indexOf(command));
  assert.ok(orderedCommands.every((index) => index >= 0));
  assert.deepEqual(
    orderedCommands,
    [...orderedCommands].sort((left, right) => left - right)
  );
});

test("the Supabase CLI used by npx is pinned exactly in the lockfile", () => {
  assert.equal(PACKAGE.devDependencies.supabase, "2.115.0");
  assert.equal(PACKAGE_LOCK.packages["node_modules/supabase"].version, "2.115.0");
  assert.match(WORKFLOW, /npx supabase start/);
  assert.match(WORKFLOW, /npx supabase stop --no-backup/);
});

test("required frontend and Supabase jobs cannot be downgraded to continue-on-error", () => {
  for (const name of ["frontend", "supabase"]) {
    // eslint-disable-next-line no-regex-spaces -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
    assert.doesNotMatch(workflowJob(name), /^    continue-on-error:/m, `${name} job no longer blocks merging`);
  }
});

test("CI widens only the timing budget while mock WebKit stays outside the required Chromium script", () => {
  assert.match(PERFORMANCE_SPEC, /TENNIS_DISCOVERY_SHELL_BUDGET_MS \?\? 1_000/);
  assert.match(WORKFLOW, /TENNIS_DISCOVERY_SHELL_BUDGET_MS: "2500"/);
  const config = createPlaywrightConfig({ mode: "mock" });
  assert.deepEqual(
    config.projects.map(({ name }) => name),
    ["desktop-chromium", "mobile-chromium", "mobile-webkit", "supabase-chromium", "supabase-mobile-chromium"]
  );
  assert.equal(
    PACKAGE.scripts["test:mock"],
    "npm run test:session-unit && TENNIS_TEST_HARNESS_MODE=mock playwright test --project=desktop-chromium --project=mobile-chromium"
  );
  assert.equal(
    PACKAGE.scripts["test:mock:webkit"],
    "TENNIS_TEST_HARNESS_MODE=mock playwright test --project=mobile-webkit"
  );
});

test("mobile WebKit mirrors mobile Chromium coverage and keeps preview outside required jobs", () => {
  const config = createPlaywrightConfig({ mode: "mock" });
  const chromium = config.projects.find(({ name }) => name === "mobile-chromium");
  const webkit = config.projects.find(({ name }) => name === "mobile-webkit");
  assert.ok(chromium && webkit);
  for (const spec of [
    "smoke.spec.js",
    "performance.spec.js",
    "error-boundary.spec.js",
    "react-unmount.spec.js",
    "react-page-focus.spec.js",
    "auth-lock.spec.js",
    "push-storage.spec.js",
    "push-cleanup-transport.spec.js",
    "push-subscription-v2-protocol.spec.js",
    "push-subscription-transport.spec.js",
    "push-subscription-composition.spec.js",
  ]) {
    assert.equal(webkit.testMatch.test(spec), chromium.testMatch.test(spec), `WebKit coverage drifted for ${spec}`);
  }
  assert.deepEqual(webkit.use.viewport, { width: 390, height: 844 });
  assert.equal(webkit.use.defaultBrowserType, "webkit");
  assert.match(
    WORKFLOW,
    // eslint-disable-next-line no-regex-spaces -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
    /webkit:\n    name: Mobile WebKit signals \(non-blocking\)[\s\S]*?continue-on-error: true[\s\S]*?playwright install --with-deps webkit[\s\S]*?npm run test:mock:webkit[\s\S]*?npx supabase start[\s\S]*?npm run test:preview:webkit[\s\S]*?npx supabase stop --no-backup/
  );
});

test("workflow uses read-only permissions, cancellation, pinned major actions, and failure evidence", () => {
  // eslint-disable-next-line no-regex-spaces -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  assert.match(WORKFLOW, /permissions:\n  contents: read/);
  assert.match(WORKFLOW, /cancel-in-progress: true/);
  for (const action of ["actions/checkout@v4", "actions/setup-node@v4", "actions/upload-artifact@v4"]) {
    assert.ok(WORKFLOW.includes(action), `workflow action missing: ${action}`);
  }
  assert.equal((WORKFLOW.match(/if: failure\(\)/g) ?? []).length, 3);
});
