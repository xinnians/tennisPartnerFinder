import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RULE = "@typescript-eslint/unbound-method";
const CONFIG_SOURCE = readFileSync(new URL("../eslint.config.js", import.meta.url), "utf8");

function trackedFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "--", ...pathspecs], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

function normalizedSeverity(value) {
  const severity = Array.isArray(value) ? value[0] : value;
  if (typeof severity === "number") return severity;
  return { off: 0, warn: 1, error: 2 }[severity];
}

const TYPESCRIPT_FILES = trackedFiles("src", "vite.config.ts").filter(
  (file) => file.endsWith(".ts") || file.endsWith(".tsx")
);

function assertCompleteTypeScriptFileSet() {
  assert.ok(
    TYPESCRIPT_FILES.length >= 70,
    `TypeScript policy scan unexpectedly found only ${TYPESCRIPT_FILES.length} files`
  );
}

test("unbound-method has one explicit global error binding", () => {
  const occurrences = CONFIG_SOURCE.match(/@typescript-eslint\/unbound-method/gu) ?? [];
  assert.equal(occurrences.length, 1, `${RULE} must occur exactly once in eslint.config.js`);
  assert.match(CONFIG_SOURCE, /"@typescript-eslint\/unbound-method":\s*"error"/u);
  assert.doesNotMatch(CONFIG_SOURCE, /"@typescript-eslint\/unbound-method":\s*"off"/u);
});

test("unbound-method is an error for every tracked TypeScript source file", async () => {
  assertCompleteTypeScriptFileSet();

  const eslint = new ESLint({ cwd: ROOT });
  for (const file of TYPESCRIPT_FILES) {
    const config = await eslint.calculateConfigForFile(file);
    assert.equal(normalizedSeverity(config.rules[RULE]), 2, `${file} does not enforce ${RULE} as an error`);
  }
});

test("inline configuration cannot suppress unbound-method findings", async () => {
  assertCompleteTypeScriptFileSet();
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfig: { linterOptions: { noInlineConfig: true } },
  });
  const results = await eslint.lintFiles(TYPESCRIPT_FILES);
  const hits = results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === RULE)
      .map((message) => `${result.filePath}:${message.line}:${message.column}`)
  );
  assert.equal(hits.length, 0, `${RULE} findings hidden by inline configuration:\n${hits.join("\n")}`);
});
