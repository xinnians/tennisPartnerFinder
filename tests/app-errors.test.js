import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

import {
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
  assert.deepEqual(Object.keys(report).sort(), ["errorName", "kind", "surface"]);
  assert.doesNotMatch(JSON.stringify(reports), /私密球友|25\.1|121\.5|LINE|secret|roster|email/i);
  assert.ok(Object.isFrozen(report));
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

test("all 18 React roots mount inside the shared boundary and ref adapters retain their contract guard", () => {
  const rootFiles = sourceFiles(ROOT.pathname).filter(
    (path) => extname(path) === ".tsx" && /create(?:Root|SurfaceRoot)\(/.test(readFileSync(path, "utf8"))
  );
  assert.equal(rootFiles.length, 18);
  assert.equal(APP_ERROR_SURFACES.length, 19, "18 roots plus the global channel must stay named");

  for (const path of rootFiles) {
    const source = readFileSync(path, "utf8");
    const label = relative(ROOT.pathname, path);
    assert.match(source, /import \{ AppErrorBoundary \}/, `${label} does not import the shared boundary`);
    assert.match(source, /<AppErrorBoundary\b/, `${label} renders a naked React root`);
  }

  const refAdapters = rootFiles.filter((path) => readFileSync(path, "utf8").includes("content did not mount"));
  assert.equal(refAdapters.length, 8);
  for (const path of refAdapters) {
    assert.match(
      readFileSync(path, "utf8"),
      /!contentRef\.current && !boundaryFailed/,
      `${relative(ROOT.pathname, path)} can replace a caught render error with an adapter throw`
    );
  }
});
