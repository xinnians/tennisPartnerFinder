import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "vite";

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
const E2E_TEST_HOOK_IDENTIFIER = "__tennisE2ETestHooks";

const developmentBuild = await build({
  build: { write: false },
  logLevel: "silent",
  mode: "development",
});
const developmentOutputs = (Array.isArray(developmentBuild) ? developmentBuild : [developmentBuild]).flatMap(
  ({ output }) => output
);
const developmentJavaScript = developmentOutputs
  .filter((output) => output.type === "chunk")
  .map(({ code }) => code)
  .join("\n");
assert.ok(
  developmentJavaScript.includes(E2E_TEST_HOOK_IDENTIFIER),
  "development bundle must retain the E2E hook before production absence can be trusted"
);

const outputFiles = readdirSync(DIST_DIR, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `${entry.parentPath}/${entry.name}`);

assert.ok(outputFiles.length >= 4, `production bundle scan is unexpectedly small: ${outputFiles.length} files`);
const output = outputFiles.map((file) => readFileSync(file, "utf8")).join("\n");
assert.ok(output.length > 100_000, `production bundle scan read only ${output.length} characters`);
for (const identifier of DEMO_IDENTIFIERS) {
  assert.ok(!output.includes(identifier), `production bundle still contains demo identifier: ${identifier}`);
}
assert.ok(!output.includes(E2E_TEST_HOOK_IDENTIFIER), "production bundle still contains the E2E test hook");

const indexHtml = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const entryScripts = [...indexHtml.matchAll(/<script\b[^>]*\bsrc="\/([^"]+\.js)"[^>]*><\/script>/g)].map(
  ([, source]) => source
);
assert.deepEqual(entryScripts.length, 1, `expected one production entry script, found ${entryScripts.length}`);
const [mainChunkPath] = entryScripts;
const mainChunk = readFileSync(new URL(`../dist/${mainChunkPath}`, import.meta.url));
const mainChunkGzipBytes = gzipSync(mainChunk).length;
const sentryMarker = "sentry_version";
assert.ok(!mainChunk.includes(sentryMarker), `Sentry SDK leaked into the production main chunk: ${mainChunkPath}`);
const sentryChunks = outputFiles.filter(
  (file) =>
    file.endsWith(".js") &&
    file !== `${DIST_DIR.pathname}${mainChunkPath}` &&
    readFileSync(file, "utf8").includes(sentryMarker)
);
assert.ok(sentryChunks.length > 0, "production build did not retain a separate lazy Sentry SDK chunk");
assert.ok(
  mainChunk.length <= MAIN_CHUNK_RAW_LIMIT_BYTES,
  `production main chunk raw size ${mainChunk.length} bytes exceeds ${MAIN_CHUNK_RAW_LIMIT_BYTES} bytes: ${mainChunkPath}`
);
assert.ok(
  mainChunkGzipBytes <= MAIN_CHUNK_GZIP_LIMIT_BYTES,
  `production main chunk gzip size ${mainChunkGzipBytes} bytes exceeds ${MAIN_CHUNK_GZIP_LIMIT_BYTES} bytes: ${mainChunkPath}`
);

console.log(
  `production bundle check passed: development E2E hook present, production E2E hook absent; ${outputFiles.length} files, ${DEMO_IDENTIFIERS.length} demo identifiers absent; main chunk ${mainChunk.length}/${mainChunkGzipBytes} bytes within ${MAIN_CHUNK_RAW_LIMIT_BYTES}/${MAIN_CHUNK_GZIP_LIMIT_BYTES}; Sentry lazy chunk: ${sentryChunks.map((file) => file.split("/").at(-1)).join(", ")}`
);
