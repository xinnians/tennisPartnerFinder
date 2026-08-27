import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SURFACE_MANIFEST } from "./fixtures/surfaceManifest.js";

const SHEETS_DIR = new URL("../src/sheets/", import.meta.url).pathname;
const SRC_DIR = new URL("../src/", import.meta.url).pathname;
const APP = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const MAIN = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const SESSION_VIEWS = readFileSync(new URL("../src/sessionViews.js", import.meta.url), "utf8");
const SURFACES = readFileSync(new URL("../src/sheets.ts", import.meta.url), "utf8");
const SURFACE_HOST = readFileSync(new URL("../src/app/SurfaceHost.tsx", import.meta.url), "utf8");
const SYNC_COMMIT = readFileSync(new URL("../src/syncCommit.ts", import.meta.url), "utf8");

function readSourceFiles(directory = SRC_DIR, relativeDirectory = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    const relativePath = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return readSourceFiles(absolutePath, relativePath);
    return /\.(?:js|ts|tsx)$/.test(entry.name) ? [{ relativePath, source: readFileSync(absolutePath, "utf8") }] : [];
  });
}

function extractBracedBody(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing source marker: ${marker}`);
  const openingBrace = source.indexOf("{", markerIndex + marker.length - 1);
  assert.notEqual(openingBrace, -1, `missing opening brace after: ${marker}`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  assert.fail(`missing closing brace after: ${marker}`);
}

function assertExactNamedScan(actual, expected, label) {
  assert.ok(actual.length > 0, `${label} scan unexpectedly found no matches`);
  assert.equal(new Set(actual).size, actual.length, `${label} scan contains duplicate names`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} differs from the surface manifest`);
}

function sourcePath(modulePath) {
  return `src/${modulePath.replace(/^\.\//, "")}`;
}

test("all React sheet adapters register tracked SurfaceHost portal content", () => {
  const sheetSources = readdirSync(SHEETS_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({ name, source: readFileSync(join(SHEETS_DIR, name), "utf8") }))
    .filter(({ source }) => source.includes("mountSurfaceContent("));

  assertExactNamedScan(
    sheetSources.map(({ name }) => `src/sheets/${name}`),
    SURFACE_MANIFEST.sheetAdapters,
    "React sheet adapter"
  );
  for (const { name, source } of sheetSources) {
    assert.doesNotMatch(source, /create(?:Root|SurfaceRoot)\(/, `${name} creates an independent React root`);
    assert.doesNotMatch(source, /flushSync/, `${name} bypasses SurfaceHost's centralized synchronous adapter`);
    assert.match(
      source,
      /\breturn surfaceContent;|\bunmount: surfaceContent\.unmount/,
      `${name} hides its unmount contract`
    );
  }
  const unmountRegistrations = [
    ...SESSION_VIEWS.matchAll(
      /\b(register\w+Content)\(mounted, content\) \{\s*mounted\.registerUnmount\(content\.unmount\);\s*\}/g
    ),
  ].map((match) => match[1]);
  assertExactNamedScan(unmountRegistrations, SURFACE_MANIFEST.unmountRegistrations, "SurfaceHost unmount registration");
  assert.equal((SYNC_COMMIT.match(/reactDomFlushSync\(/g) ?? []).length, 1);
  assert.match(SURFACE_HOST, /commitSynchronously\(commitSurfaceSlots\)/);
  assert.match(SURFACE_HOST, /commitSynchronously\(update\)/);

  const imperativeAdapters = sheetSources.filter(({ source }) => source.includes("contentRef.current"));
  assertExactNamedScan(
    imperativeAdapters.map(({ name }) => `src/sheets/${name}`),
    SURFACE_MANIFEST.imperativeAdapters,
    "imperative sheet adapter"
  );
  for (const { name, source } of imperativeAdapters) {
    assert.match(source, /surfaceContent\.commit\(/, `${name} loses synchronous imperative update semantics`);
  }
});

test("synchronous React commits stay behind one fail-closed helper and approved callers", () => {
  const sourceFiles = readSourceFiles();
  assert.ok(sourceFiles.length > 0, "source scan unexpectedly found no JavaScript or TypeScript files");

  const helper = sourceFiles.find(({ relativePath }) => relativePath === "syncCommit.ts");
  assert.ok(helper, "missing synchronous commit anchor: src/syncCommit.ts");
  assert.deepEqual(
    [...helper.source.matchAll(/from ["']([^"']+)["']/g)].map((match) => match[1]),
    ["react-dom"],
    "src/syncCommit.ts must remain a leaf that imports only react-dom"
  );
  assert.match(helper.source, /import \{ flushSync as reactDomFlushSync \} from "react-dom";/);
  assert.match(helper.source, /export function syncCommit\(update: \(\) => void\): void \{/);
  assert.match(helper.source, /reactDomFlushSync\(update\);/);

  const approvedCallers = ["app/SurfaceHost.tsx", "sessionStore.ts"];
  const callers = sourceFiles
    .filter(({ relativePath }) => relativePath !== "syncCommit.ts")
    .filter(({ source }) => /\bsyncCommit\(/.test(source))
    .sort(({ relativePath: left }, { relativePath: right }) => left.localeCompare(right));
  assert.ok(callers.length > 0, "syncCommit caller scan unexpectedly found no call sites");
  assert.deepEqual(
    callers.map(({ relativePath }) => relativePath),
    approvedCallers
  );
  for (const { relativePath, source } of callers) {
    assert.match(
      source,
      /import \{ syncCommit \} from "(?:\.\.\/|\.\/)syncCommit\.ts";/,
      `${relativePath} hides its import`
    );
  }
});

test("non-home pages and sheets stay behind explicit preloadable module boundaries", () => {
  const eagerModules = [...MAIN.matchAll(/^import .* from "(\.\/app\/App\.tsx)";$/gm)].map((match) =>
    sourcePath(match[1])
  );
  assertExactNamedScan(eagerModules, SURFACE_MANIFEST.eagerModules, "eager surface module");
  const lazySheetMap = extractBracedBody(SESSION_VIEWS, "const lazySurfaceLoaders = {");
  const lazySheets = [...lazySheetMap.matchAll(/"(\.\/sheets\/.+?\.tsx)":\s*\(\) =>\s*import\("\1"\)/g)].map((match) =>
    sourcePath(match[1])
  );
  assertExactNamedScan(lazySheets, SURFACE_MANIFEST.lazySheets, "lazy sheet module");
  assert.doesNotMatch(lazySheetMap, /eager:/);
  const lazyPages = [...APP.matchAll(/\w+Request \?\?= import\("\.\.\/pages\/([^"/]+)\.tsx"\)/g)].map(
    (match) => `src/pages/${match[1]}.tsx`
  );
  assertExactNamedScan(lazyPages, SURFACE_MANIFEST.lazyPages, "lazy page module");
  assert.match(SESSION_VIEWS, /pointerover[\s\S]*focusin/);
  assert.match(SESSION_VIEWS, /if \(authSession\) preloadAuthenticatedViews\(\)/);
});

test("AppShell preserves navigation, toast, popover, and Escape accessibility contracts", () => {
  const navDestinations = [...APP.matchAll(/activePage === "([^"]+)"/g)].map((match) => match[1]);
  assertExactNamedScan(navDestinations, SURFACE_MANIFEST.navDestinations, "React navigation destination");
  assert.match(APP, /aria-expanded=\{popoverOpen\}/);
  assert.match(APP, /aria-controls="level-popover"/);
  assert.match(APP, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*setPopoverOpen\(false\);/);
  assert.match(INDEX, /<div id="toast-root" aria-live="polite" aria-atomic="true"><\/div>/);
});

test("surface close unmounts content before destroying its React shell and remains idempotent", () => {
  const unmount = SURFACES.indexOf("unmountContent?.();");
  const destroyShell = SURFACES.indexOf("shell.unmount();", unmount);
  assert.ok(unmount >= 0, "surface close never calls its registered React unmount");
  assert.ok(destroyShell > unmount, "surface close destroys its React shell before content can clean up");
  assert.match(SURFACES, /if \(closed\) return;/);
  assert.match(SURFACES, /return \{ root, surface, close, registerUnmount \};/);
});

test("Session Detail blocks both direct and async commits after its surface dies", () => {
  const detail = readFileSync(join(SHEETS_DIR, "SessionDetailSheet.tsx"), "utf8");
  const mountBody = extractBracedBody(detail, "export function mountSessionDetailSheetContent(");
  const contractBody = extractBracedBody(mountBody, "return {");
  const imperativeMethodBodies = [
    extractBracedBody(contractBody, "enterConfirming(expectedAccepted) {"),
    extractBracedBody(contractBody, "handleEscape() {"),
    extractBracedBody(contractBody, "setJoinPreview(state) {"),
  ];

  assert.match(detail, /if \(!surfaceContent\.isSurfaceRootLive\(\)\) return;/);
  for (const methodBody of imperativeMethodBodies) {
    assert.match(methodBody, /surfaceContent\.commit\(/);
  }
  assert.equal((contractBody.match(/surfaceContent\.commit\(/g) ?? []).length, imperativeMethodBodies.length);
  assert.doesNotMatch(SESSION_VIEWS, /content\.renderStage|function renderStage/);
});
