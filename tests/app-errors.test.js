import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

import {
  APP_ERROR_TRANSPORT_FIELDS,
  APP_ERROR_SURFACES,
  captureAppError,
  configureAppErrorTransport,
  installGlobalErrorHandlers,
} from "../src/appErrors.ts";

const ROOT = new URL("../src/", import.meta.url);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

test("error transport receives only the fixed privacy allowlist", () => {
  const reports = [];
  const restore = configureAppErrorTransport((report) => reports.push(report));
  const privateError = Object.assign(new Error("nickname=私密球友 GPS=25.1,121.5 LINE=secret@example.test"), {
    name: "PrivateProfileError",
    stack: "roster and email@example.test",
  });

  const report = captureAppError("react-render", "session-detail-sheet", privateError);
  const unknown = captureAppError("window-error", "user-provided-surface", privateError);
  restore();

  assert.deepEqual(report, { errorName: "Error", kind: "react-render", surface: "session-detail-sheet" });
  assert.deepEqual(unknown, { errorName: "Error", kind: "window-error", surface: "global" });
  assert.deepEqual(APP_ERROR_TRANSPORT_FIELDS, ["errorName", "kind", "surface"]);
  assert.deepEqual(Object.keys(report), APP_ERROR_TRANSPORT_FIELDS);
  assert.doesNotMatch(JSON.stringify(reports), /私密球友|25\.1|121\.5|LINE|secret|roster|email/i);
  assert.ok(Object.isFrozen(APP_ERROR_TRANSPORT_FIELDS));
  assert.ok(Object.isFrozen(report));
});

test("production leaves the sole error transport registration point uncalled", () => {
  const references = sourceFiles(ROOT.pathname).flatMap((path) => {
    if (![".js", ".ts", ".tsx"].includes(extname(path))) return [];
    const matches = readFileSync(path, "utf8").match(/configureAppErrorTransport/g) ?? [];
    return matches.map(() => relative(ROOT.pathname, path));
  });

  assert.deepEqual(references, ["appErrors.ts"]);
  assert.match(
    readFileSync(new URL("../src/appErrors.ts", import.meta.url), "utf8"),
    /let transport: AppErrorTransport = NOOP_TRANSPORT/
  );
});

test("global error and rejection listeners are idempotent, removable, and transport-safe", () => {
  const target = new EventTarget();
  const captured = [];
  const restoreTransport = configureAppErrorTransport(() => {
    throw new Error("transport unavailable");
  });
  const cleanup = installGlobalErrorHandlers(target, { onCaptured: (report) => captured.push(report) });
  assert.equal(installGlobalErrorHandlers(target), cleanup);

  const errorEvent = new Event("error");
  Object.defineProperty(errorEvent, "error", { value: new TypeError("private detail") });
  target.dispatchEvent(errorEvent);
  const rejectionEvent = new Event("unhandledrejection");
  Object.defineProperty(rejectionEvent, "reason", { value: new RangeError("private detail") });
  target.dispatchEvent(rejectionEvent);

  assert.deepEqual(captured, [
    { errorName: "TypeError", kind: "window-error", surface: "global" },
    { errorName: "RangeError", kind: "unhandled-rejection", surface: "global" },
  ]);
  cleanup();
  target.dispatchEvent(errorEvent);
  assert.equal(captured.length, 2);
  restoreTransport();
});

test("the single App root retains all 18 isolated error surfaces", () => {
  const rootFiles = sourceFiles(ROOT.pathname).filter(
    (path) => extname(path) === ".tsx" && /create(?:Root|SurfaceRoot)\(/.test(readFileSync(path, "utf8"))
  );
  assert.equal(rootFiles.length, 1);
  assert.equal(APP_ERROR_SURFACES.length, 19, "18 isolated surfaces plus the global channel must stay named");

  for (const path of rootFiles) {
    const source = readFileSync(path, "utf8");
    const label = relative(ROOT.pathname, path);
    assert.match(source, /import \{ AppErrorBoundary \}/, `${label} does not import the shared boundary`);
    assert.match(source, /<AppErrorBoundary\b/, `${label} renders a naked React root`);
  }

  const appSource = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
  const sheetFiles = sourceFiles(new URL("../src/sheets/", import.meta.url).pathname).filter(
    (path) => extname(path) === ".tsx" && /mountSurfaceContent\(/.test(readFileSync(path, "utf8"))
  );
  const pageSources = sourceFiles(new URL("../src/pages/", import.meta.url).pathname)
    .filter((path) => extname(path) === ".tsx")
    .map((path) => readFileSync(path, "utf8"));
  assert.equal((appSource.match(/createRoot\(/g) ?? []).length, 1, "App must own exactly one React root");
  assert.equal(
    pageSources.filter((source) => /createRoot\(/.test(source)).length,
    0,
    "page modules must render through App instead of creating roots"
  );
  for (const surface of ["me-page", "messages-page", "my-sessions-page", "nearby-sessions-drawer"]) {
    assert.match(appSource, new RegExp(`surface=["']${surface}["']`), `${surface} lost its isolated boundary`);
  }

  assert.equal(sheetFiles.length, 14, "all sheet contents must register with SurfaceHost");
  for (const path of sheetFiles) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /import \{ AppErrorBoundary \}/, `${relative(ROOT.pathname, path)} lost its boundary`);
    assert.match(source, /<AppErrorBoundary\b/, `${relative(ROOT.pathname, path)} renders naked portal content`);
  }

  const refAdapters = sheetFiles.filter((path) => readFileSync(path, "utf8").includes("content did not mount"));
  assert.equal(refAdapters.length, 8);
  for (const path of refAdapters) {
    assert.match(
      readFileSync(path, "utf8"),
      /!contentRef\.current && !boundaryFailed/,
      `${relative(ROOT.pathname, path)} can replace a caught render error with an adapter throw`
    );
  }
});
