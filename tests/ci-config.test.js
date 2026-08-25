import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { createPlaywrightConfig } from "../playwright.config.js";
import createViteConfig from "../vite.config.ts";

const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const PACKAGE_LOCK = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const NVMRC = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const WORKFLOW = readFileSync(new URL("../.github/workflows/quality-gate.yml", import.meta.url), "utf8");
const PERFORMANCE_SPEC = readFileSync(new URL("./performance.spec.js", import.meta.url), "utf8");
const FAKE_MAPS = readFileSync(new URL("./fixtures/fakeMaps.js", import.meta.url), "utf8");
const DEVELOPMENT_BRANCH = "claude/tennis-partner-finder-proto-xfrr6g";
const REQUIRED_NODE_VERSION = [22, 18, 0];

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

test("lint and Prettier cover source, test, script, and executable root configuration files", () => {
  assert.equal(
    PACKAGE.scripts.lint,
    'eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts'
  );
  assert.equal(
    PACKAGE.scripts["prettier:check"],
    'prettier --check "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts package.json package-lock.json tsconfig.json vercel.json'
  );
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
  }
});

test("browser fixtures intercept every Google-hosted avatar without bypassing fallback assertions", () => {
  assert.match(FAKE_MAPS, /page\.route\("https:\/\/lh\*\.googleusercontent\.com\/\*\*"/);
  assert.match(FAKE_MAPS, /contentType: "image\/png"/);
  // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  assert.match(readFileSync(new URL(".\/smoke.spec.js", import.meta.url), "utf8"), /dispatchEvent\("error"\)/);
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

test("Supabase CI owns reset, pgTAP, desktop, and mobile browser journeys", () => {
  assert.equal(
    PACKAGE.scripts["test:local:mobile"],
    "TENNIS_TEST_HARNESS_MODE=local playwright test --project=supabase-mobile-chromium"
  );
  assert.deepEqual(scriptCommands("test:ci:supabase"), [
    "node scripts/generate-courts-seed.mjs --check",
    "npm run test:db",
    "npm run test:local",
    "npm run test:local:mobile",
    "git diff --check",
  ]);
  assert.match(WORKFLOW, /run: npm run test:ci:supabase/);
  assert.match(WORKFLOW, /CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test/);
  assert.match(WORKFLOW, /if: always\(\)[\s\S]*npx supabase stop --no-backup/);
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

test("mobile WebKit mirrors mobile Chromium coverage but cannot block the workflow", () => {
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
  ]) {
    assert.equal(webkit.testMatch.test(spec), chromium.testMatch.test(spec), `WebKit coverage drifted for ${spec}`);
  }
  assert.deepEqual(webkit.use.viewport, { width: 390, height: 844 });
  assert.equal(webkit.use.defaultBrowserType, "webkit");
  assert.match(
    WORKFLOW,
    // eslint-disable-next-line no-regex-spaces -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
    /webkit:\n    name: Mobile WebKit \(non-blocking\)[\s\S]*?continue-on-error: true[\s\S]*?playwright install --with-deps webkit[\s\S]*?npm run test:mock:webkit/
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
