import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SHEETS_DIR = new URL("../src/sheets/", import.meta.url).pathname;
const SESSION_VIEWS = readFileSync(new URL("../src/sessionViews.js", import.meta.url), "utf8");
const SURFACES = readFileSync(new URL("../src/sheets.js", import.meta.url), "utf8");

test("all 14 React sheet adapters register tracked SurfaceHost portal content", () => {
  const sheetSources = readdirSync(SHEETS_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({ name, source: readFileSync(join(SHEETS_DIR, name), "utf8") }))
    .filter(({ source }) => source.includes("mountSurfaceContent("));

  assert.equal(sheetSources.length, 14);
  for (const { name, source } of sheetSources) {
    assert.doesNotMatch(source, /create(?:Root|SurfaceRoot)\(/, `${name} creates an independent React root`);
    assert.match(
      source,
      /\breturn surfaceContent;|\bunmount: surfaceContent\.unmount/,
      `${name} hides its unmount contract`
    );
  }
  assert.equal((SESSION_VIEWS.match(/mounted\.registerUnmount\(content\.unmount\)/g) ?? []).length, 14);
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
  assert.match(detail, /if \(!surfaceContent\.isSurfaceRootLive\(\)\) return;/);
  assert.match(SESSION_VIEWS, /if \(!content\.isSurfaceRootLive\(\)\) return false;/);
  assert.match(SESSION_VIEWS, /if \(!renderStage\(nextStage, message\)\) return;/);
});
