import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createPlaywrightConfig } from "../playwright.config.js";
import createViteConfig from "../vite.config.ts";

const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const WORKFLOW = readFileSync(new URL("../.github/workflows/quality-gate.yml", import.meta.url), "utf8");
const PERFORMANCE_SPEC = readFileSync(new URL("./performance.spec.js", import.meta.url), "utf8");
const DEVELOPMENT_BRANCH = "claude/tennis-partner-finder-proto-xfrr6g";

test("quality workflow runs for main and the current development branch", () => {
  assert.ok(WORKFLOW.length > 1_000, "quality workflow is unexpectedly small");
  assert.match(WORKFLOW, /pull_request:\n    branches: \[main, claude\/tennis-partner-finder-proto-xfrr6g\]/);
  assert.match(WORKFLOW, /push:\n    branches: \[main, claude\/tennis-partner-finder-proto-xfrr6g\]/);
  assert.match(WORKFLOW, /workflow_dispatch:/);
  assert.ok(WORKFLOW.includes(DEVELOPMENT_BRANCH));
});

test("frontend CI script contains every current non-database gate in order", () => {
  const script = PACKAGE.scripts["test:ci:frontend"];
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
  let previous = -1;
  for (const gate of gates) {
    const position = script.indexOf(gate);
    assert.ok(position > previous, `frontend CI gate missing or out of order: ${gate}`);
    previous = position;
  }
  assert.match(WORKFLOW, /run: npm run test:ci:frontend/);
});

test("production alias excludes mockData through every relative import shape", () => {
  assert.equal(typeof createViteConfig, "function");
  const production = createViteConfig({ command: "build", mode: "production" });
  const aliases = production.resolve?.alias;
  assert.equal(aliases?.length, 1);
  const [{ find, replacement }] = aliases;
  for (const specifier of ["mockData.js", "./mockData.js", "../mockData.js", "../../src/mockData.js", "/src/mockData.js"]) {
    assert.ok(find.test(specifier), `production mock alias misses ${specifier}`);
  }
  assert.equal(find.test("./mockData.empty.js"), false);
  assert.match(replacement, /\/src\/mockData\.empty\.js$/);

  const development = createViteConfig({ command: "serve", mode: "development" });
  assert.equal(development.resolve, undefined, "development and mock harness must retain the full fixture");
});

test("Supabase CI owns reset, pgTAP, desktop, and mobile browser journeys", () => {
  assert.equal(
    PACKAGE.scripts["test:local:mobile"],
    "TENNIS_TEST_HARNESS_MODE=local playwright test --project=supabase-mobile-chromium"
  );
  const script = PACKAGE.scripts["test:ci:supabase"];
  for (const gate of ["npm run test:db", "npm run test:local", "npm run test:local:mobile", "git diff --check"]) {
    assert.ok(script.includes(gate), `Supabase CI gate missing: ${gate}`);
  }
  assert.match(WORKFLOW, /CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test/);
  assert.match(WORKFLOW, /if: always\(\)[\s\S]*npx supabase stop --no-backup/);
});

test("CI widens only the timing budget and keeps the four current Chromium projects", () => {
  assert.match(PERFORMANCE_SPEC, /TENNIS_DISCOVERY_SHELL_BUDGET_MS \?\? 1_000/);
  assert.match(WORKFLOW, /TENNIS_DISCOVERY_SHELL_BUDGET_MS: "2500"/);
  const config = createPlaywrightConfig({ mode: "mock" });
  assert.deepEqual(
    config.projects.map(({ name }) => name),
    ["desktop-chromium", "mobile-chromium", "supabase-chromium", "supabase-mobile-chromium"]
  );
  assert.doesNotMatch(WORKFLOW, /webkit/i);
});

test("workflow uses read-only permissions, cancellation, pinned major actions, and failure evidence", () => {
  assert.match(WORKFLOW, /permissions:\n  contents: read/);
  assert.match(WORKFLOW, /cancel-in-progress: true/);
  for (const action of ["actions/checkout@v4", "actions/setup-node@v4", "actions/upload-artifact@v4"]) {
    assert.ok(WORKFLOW.includes(action), `workflow action missing: ${action}`);
  }
  assert.equal((WORKFLOW.match(/if: failure\(\)/g) ?? []).length, 2);
});
