import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import test from "node:test";
import { FRONTEND_ARCHITECTURE_MANIFEST } from "./fixtures/frontendArchitectureManifest.js";
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

function readStructureSource(name) {
  const relativePath = SURFACE_MANIFEST.structureSources[name];
  assert.match(relativePath ?? "", /^src\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:js|ts|tsx)$/);
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  assert.ok(source.length > 0, `${name} structure source is empty: ${relativePath}`);
  return { relativePath, source };
}

function resolveImportPath(ownerPath, modulePath) {
  return posix.normalize(posix.join(posix.dirname(ownerPath), modulePath));
}

function syncCommitCallers(sourceFiles) {
  return sourceFiles
    .filter(({ relativePath }) => relativePath !== "syncCommit.ts")
    .filter(({ source }) => /\bsyncCommit\(/.test(source))
    .sort(({ relativePath: left }, { relativePath: right }) => left.localeCompare(right));
}

function assertApprovedSyncCommitCallers(sourceFiles) {
  const callers = syncCommitCallers(sourceFiles);
  assert.ok(callers.length > 0, "syncCommit caller scan unexpectedly found no call sites");
  assert.deepEqual(
    callers.map(({ relativePath }) => `src/${relativePath}`),
    FRONTEND_ARCHITECTURE_MANIFEST.syncCommitCallers
  );
  return callers;
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
  const unmountSource = readStructureSource("unmountRegistrations");
  const unmountRegistrations = [
    ...unmountSource.source.matchAll(
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

  const callers = assertApprovedSyncCommitCallers(sourceFiles);
  for (const { relativePath, source } of callers) {
    assert.match(
      source,
      /import \{ syncCommit \} from "(?:\.\.\/|\.\/)syncCommit\.ts";/,
      `${relativePath} hides its import`
    );
  }

  assert.throws(
    () =>
      assertApprovedSyncCommitCallers([
        ...sourceFiles,
        { relativePath: "__sync_commit_canary.ts", source: "syncCommit(() => {});" },
      ]),
    { name: "AssertionError" },
    "a third syncCommit caller stayed green"
  );
  assertApprovedSyncCommitCallers(sourceFiles);
});

test("non-home pages and sheets stay behind explicit preloadable module boundaries", () => {
  const eagerModules = [...MAIN.matchAll(/^import .* from "(\.\/app\/App\.tsx)";$/gm)].map((match) =>
    sourcePath(match[1])
  );
  assertExactNamedScan(eagerModules, SURFACE_MANIFEST.eagerModules, "eager surface module");
  const lazySource = readStructureSource("lazySurfaceLoaders");
  const lazySheetMap = extractBracedBody(lazySource.source, "const lazySurfaceLoaders = {");
  const lazySheets = [...lazySheetMap.matchAll(/"(\.\.?(?:\/[^"/]+)+\.tsx)":\s*\(\) =>\s*import\("\1"\)/g)].map(
    (match) => resolveImportPath(lazySource.relativePath, match[1])
  );
  assertExactNamedScan(lazySheets, SURFACE_MANIFEST.lazySheets, "lazy sheet module");
  const lazyPages = [...APP.matchAll(/\w+Request \?\?= import\("\.\.\/pages\/([^"/]+)\.tsx"\)/g)].map(
    (match) => `src/pages/${match[1]}.tsx`
  );
  assertExactNamedScan(lazyPages, SURFACE_MANIFEST.lazyPages, "lazy page module");
  const authPreloadSource = readStructureSource("authenticatedPreload").source;
  assert.match(
    authPreloadSource,
    /export function preloadAuthenticatedViewsForAuth\(authSession\) \{\s*if \(authSession\) preloadAuthenticatedViews\(\);\s*\}/
  );
});

test("low-risk helpers stay private and auth preload runs only at the verified identity transition", () => {
  assert.equal((MAIN.match(/\bpreloadAuthenticatedViewsForAuth\(/g) ?? []).length, 1);
  assert.match(MAIN, /onAuthIdentityChange: \(context\) => \{\s*preloadAuthenticatedViewsForAuth\(context\.session\);/);
  assert.match(SURFACE_HOST, /\binterface SurfaceSlot \{/);
  assert.doesNotMatch(SURFACE_HOST, /\bexport interface SurfaceSlot \{/);
  assert.match(SESSION_VIEWS, /\bconst PROFILE_PUBLIC_DISCLOSURE\s*=/);
  assert.doesNotMatch(SESSION_VIEWS, /\bexport const PROFILE_PUBLIC_DISCLOSURE\s*=/);
  assert.match(SESSION_VIEWS, /\bconst sessionFormSheetRuntime\s*=\s*Object\.freeze\(/);
  assert.doesNotMatch(SESSION_VIEWS, /\bexport const sessionFormSheetRuntime\s*=/);
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
});
