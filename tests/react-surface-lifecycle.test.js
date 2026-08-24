import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SHEETS_DIR = new URL("../src/sheets/", import.meta.url).pathname;
const SRC_DIR = new URL("../src/", import.meta.url).pathname;
const APP = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const SESSION_VIEWS = readFileSync(new URL("../src/sessionViews.js", import.meta.url), "utf8");
const SURFACES = readFileSync(new URL("../src/sheets.js", import.meta.url), "utf8");
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

test("all 14 React sheet adapters register tracked SurfaceHost portal content", () => {
  const sheetSources = readdirSync(SHEETS_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({ name, source: readFileSync(join(SHEETS_DIR, name), "utf8") }))
    .filter(({ source }) => source.includes("mountSurfaceContent("));

  assert.equal(sheetSources.length, 14);
  for (const { name, source } of sheetSources) {
    assert.doesNotMatch(source, /create(?:Root|SurfaceRoot)\(/, `${name} creates an independent React root`);
    assert.doesNotMatch(source, /flushSync/, `${name} bypasses SurfaceHost's centralized synchronous adapter`);
    assert.match(
      source,
      /\breturn surfaceContent;|\bunmount: surfaceContent\.unmount/,
      `${name} hides its unmount contract`
    );
  }
  assert.equal((SESSION_VIEWS.match(/mounted\.registerUnmount\(content\.unmount\)/g) ?? []).length, 14);
  assert.equal((SYNC_COMMIT.match(/reactDomFlushSync\(/g) ?? []).length, 1);
  assert.match(SURFACE_HOST, /commitSynchronously\(commitSurfaceSlots\)/);
  assert.match(SURFACE_HOST, /commitSynchronously\(update\)/);

  const imperativeAdapters = sheetSources.filter(({ source }) => source.includes("contentRef.current"));
  assert.equal(imperativeAdapters.length, 8);
  for (const { name, source } of imperativeAdapters) {
    assert.match(source, /surfaceContent\.commit\(/, `${name} loses synchronous imperative update semantics`);
  }
});

test("synchronous React commits stay behind one fail-closed helper and three approved callers", () => {
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

  const approvedCallers = ["app/App.tsx", "app/SurfaceHost.tsx", "sessionStore.ts"];
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
  assert.equal((SESSION_VIEWS.match(/eager: true/g) ?? []).length, 2, "only App and Session Detail stay eager");
  const lazySheetList = SESSION_VIEWS.match(/import\.meta\.glob\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
  assert.equal((lazySheetList.match(/\.\/sheets\/.+?\.tsx/g) ?? []).length, 13);
  assert.doesNotMatch(lazySheetList, /eager:/);
  assert.equal((APP.match(/Request \?\?= import\("\.\.\/pages\//g) ?? []).length, 3);
  assert.match(SESSION_VIEWS, /pointerover[\s\S]*focusin/);
  assert.match(SESSION_VIEWS, /if \(authSession\) preloadAuthenticatedViews\(\)/);
});

test("surface close unmounts React before clearing DOM and remains idempotent", () => {
  const unmount = SURFACES.indexOf("unmountContent?.();");
  const clearDom = SURFACES.indexOf('root.innerHTML = "";', unmount);
  assert.ok(unmount >= 0, "surface close never calls its registered React unmount");
  assert.ok(clearDom > unmount, "surface close clears DOM before React can clean up");
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
  assert.equal((contractBody.match(/surfaceContent\.commit\(/g) ?? []).length, 3);
  assert.doesNotMatch(SESSION_VIEWS, /content\.renderStage|function renderStage/);
});
