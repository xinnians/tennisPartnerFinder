import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIST_DIR = new URL("../dist/", import.meta.url);
// E1 final entry chunk was 639,896 raw bytes / 184,705 gzip bytes.
// Keep 10% headroom for normal maintenance without allowing the main chunk to grow back unnoticed.
const MAIN_CHUNK_RAW_LIMIT_BYTES = 703_886;
const MAIN_CHUNK_GZIP_LIMIT_BYTES = 203_176;
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

const indexHtml = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const entryScripts = [...indexHtml.matchAll(/<script\b[^>]*\bsrc="\/([^"]+\.js)"[^>]*><\/script>/g)].map(
  ([, source]) => source
);
assert.deepEqual(entryScripts.length, 1, `expected one production entry script, found ${entryScripts.length}`);
const [mainChunkPath] = entryScripts;
const mainChunk = readFileSync(new URL(`../dist/${mainChunkPath}`, import.meta.url));
const mainChunkGzipBytes = gzipSync(mainChunk).length;
assert.ok(
  mainChunk.length <= MAIN_CHUNK_RAW_LIMIT_BYTES,
  `production main chunk raw size ${mainChunk.length} bytes exceeds ${MAIN_CHUNK_RAW_LIMIT_BYTES} bytes: ${mainChunkPath}`
);
assert.ok(
  mainChunkGzipBytes <= MAIN_CHUNK_GZIP_LIMIT_BYTES,
  `production main chunk gzip size ${mainChunkGzipBytes} bytes exceeds ${MAIN_CHUNK_GZIP_LIMIT_BYTES} bytes: ${mainChunkPath}`
);

console.log(
  `production bundle check passed: ${outputFiles.length} files, ${DEMO_IDENTIFIERS.length} demo identifiers absent; main chunk ${mainChunk.length}/${mainChunkGzipBytes} bytes within ${MAIN_CHUNK_RAW_LIMIT_BYTES}/${MAIN_CHUNK_GZIP_LIMIT_BYTES}`
);
