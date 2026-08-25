import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const DIST_DIR = new URL("../dist/", import.meta.url);
// F4-3 emits 654,771 raw / 191,396 gzip after authenticated repositories become conditional.
// One 4 KiB raw / 1 KiB gzip maintenance window keeps the budget below the prior 661,080/192,693 bundle.
const MAIN_CHUNK_RAW_LIMIT_BYTES = 658_867;
const MAIN_CHUNK_GZIP_LIMIT_BYTES = 192_420;
// The largest ordinary lazy surface is 16,912/5,122; keep roughly 1 KiB/378 B for local maintenance.
const LAZY_CHUNK_RAW_LIMIT_BYTES = 18_000;
const LAZY_CHUNK_GZIP_LIMIT_BYTES = 5_500;
// Sentry is intentionally isolated but substantially larger than application lazy chunks.
const SENTRY_CHUNK_RAW_LIMIT_BYTES = 90_000;
const SENTRY_CHUNK_GZIP_LIMIT_BYTES = 31_000;
// F4-3 total JS (including push-sw.js) is 841,545/256,497. A 1% ceiling prevents split-induced growth.
const TOTAL_JS_RAW_LIMIT_BYTES = 849_961;
const TOTAL_JS_GZIP_LIMIT_BYTES = 259_062;
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
const mainChunkFile = `${DIST_DIR.pathname}${mainChunkPath}`;
const javascriptChunks = outputFiles
  .filter((file) => file.endsWith(".js"))
  .map((file) => {
    const source = readFileSync(file);
    return { file, gzipBytes: gzipSync(source).length, rawBytes: source.length, source };
  });
assert.ok(
  javascriptChunks.length >= 4,
  `production JavaScript chunk scan is unexpectedly small: ${javascriptChunks.length}`
);
assert.ok(
  javascriptChunks.some(({ file }) => file === mainChunkFile),
  `entry chunk is absent from JS scan: ${mainChunkPath}`
);

const sentryMarker = "sentry_version";
assert.ok(!mainChunk.includes(sentryMarker), `Sentry SDK leaked into the production main chunk: ${mainChunkPath}`);
const sentryChunks = javascriptChunks.filter(
  ({ file, source }) => file !== mainChunkFile && source.includes(sentryMarker)
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
const privateDataMarker = "tennis_private_data_repository_v1";
assert.ok(!mainChunk.includes(privateDataMarker), `private repository leaked into the main chunk: ${mainChunkPath}`);
const privateDataChunks = javascriptChunks.filter(
  ({ file, source }) => file !== mainChunkFile && source.includes(privateDataMarker)
);
assert.equal(privateDataChunks.length, 1, `expected one private repository chunk, found ${privateDataChunks.length}`);

for (const chunk of javascriptChunks.filter(({ file }) => file !== mainChunkFile)) {
  const isSentry = sentryChunks.includes(chunk);
  const rawLimit = isSentry ? SENTRY_CHUNK_RAW_LIMIT_BYTES : LAZY_CHUNK_RAW_LIMIT_BYTES;
  const gzipLimit = isSentry ? SENTRY_CHUNK_GZIP_LIMIT_BYTES : LAZY_CHUNK_GZIP_LIMIT_BYTES;
  const name = chunk.file.split("/").at(-1);
  assert.ok(
    chunk.rawBytes <= rawLimit,
    `production lazy chunk raw size ${chunk.rawBytes} exceeds ${rawLimit}: ${name}`
  );
  assert.ok(
    chunk.gzipBytes <= gzipLimit,
    `production lazy chunk gzip size ${chunk.gzipBytes} exceeds ${gzipLimit}: ${name}`
  );
}

const totalJavaScriptRawBytes = javascriptChunks.reduce((total, chunk) => total + chunk.rawBytes, 0);
const totalJavaScriptGzipBytes = javascriptChunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);
assert.ok(
  totalJavaScriptRawBytes <= TOTAL_JS_RAW_LIMIT_BYTES,
  `production JavaScript raw total ${totalJavaScriptRawBytes} exceeds ${TOTAL_JS_RAW_LIMIT_BYTES}`
);
assert.ok(
  totalJavaScriptGzipBytes <= TOTAL_JS_GZIP_LIMIT_BYTES,
  `production JavaScript gzip total ${totalJavaScriptGzipBytes} exceeds ${TOTAL_JS_GZIP_LIMIT_BYTES}`
);

const largestApplicationLazyChunk = javascriptChunks
  .filter((chunk) => chunk.file !== mainChunkFile && !sentryChunks.includes(chunk))
  .sort((left, right) => right.rawBytes - left.rawBytes)[0];

console.log(
  `production bundle check passed: development E2E hook present, production E2E hook absent; ${outputFiles.length} files, ${DEMO_IDENTIFIERS.length} demo identifiers absent; main ${mainChunk.length}/${mainChunkGzipBytes} within ${MAIN_CHUNK_RAW_LIMIT_BYTES}/${MAIN_CHUNK_GZIP_LIMIT_BYTES}; largest app lazy ${largestApplicationLazyChunk.file.split("/").at(-1)} ${largestApplicationLazyChunk.rawBytes}/${largestApplicationLazyChunk.gzipBytes} within ${LAZY_CHUNK_RAW_LIMIT_BYTES}/${LAZY_CHUNK_GZIP_LIMIT_BYTES}; total JS ${totalJavaScriptRawBytes}/${totalJavaScriptGzipBytes} within ${TOTAL_JS_RAW_LIMIT_BYTES}/${TOTAL_JS_GZIP_LIMIT_BYTES}; private repository: ${privateDataChunks[0].file.split("/").at(-1)}; Sentry: ${sentryChunks.map(({ file }) => file.split("/").at(-1)).join(", ")}`
);
