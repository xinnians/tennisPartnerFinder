import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DIST_DIR = new URL("../dist/", import.meta.url);
const DEMO_IDENTIFIERS = [
  "示範山嵐",
  "示範彗星",
  "示範晨霧",
  "示範月光",
  "示範杉林",
  "示範松果",
  "示範海星",
  "示範海風",
  "示範溪流",
  "示範球友",
  "示範琥珀",
  "示範雲朵",
];

const outputFiles = readdirSync(DIST_DIR, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `${entry.parentPath}/${entry.name}`);

assert.ok(outputFiles.length >= 4, `production bundle scan is unexpectedly small: ${outputFiles.length} files`);
const output = outputFiles.map((file) => readFileSync(file, "utf8")).join("\n");
assert.ok(output.length > 100_000, `production bundle scan read only ${output.length} characters`);
for (const identifier of DEMO_IDENTIFIERS) {
  assert.ok(!output.includes(identifier), `production bundle still contains demo identifier: ${identifier}`);
}

console.log(`production bundle check passed: ${outputFiles.length} files, ${DEMO_IDENTIFIERS.length} demo identifiers absent`);
