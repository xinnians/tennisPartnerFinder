import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "vite";

import {
  applyByteLimitPolicy,
  BUNDLE_SIZE_LIMITS,
  collectInitialJavaScriptChunks,
  identifySentryChunk,
  parseByteLimitMode,
} from "./productionBundlePolicy.mjs";

const DIST_DIR = new URL("../dist/", import.meta.url);
const byteLimitMode = parseByteLimitMode(process.argv.slice(2));
const {
  lazyGzipBytes: LAZY_CHUNK_GZIP_LIMIT_BYTES,
  lazyRawBytes: LAZY_CHUNK_RAW_LIMIT_BYTES,
  mainGzipBytes: MAIN_CHUNK_GZIP_LIMIT_BYTES,
  mainRawBytes: MAIN_CHUNK_RAW_LIMIT_BYTES,
  sentryGzipBytes: SENTRY_CHUNK_GZIP_LIMIT_BYTES,
  sentryRawBytes: SENTRY_CHUNK_RAW_LIMIT_BYTES,
  totalGzipBytes: TOTAL_JS_GZIP_LIMIT_BYTES,
  totalRawBytes: TOTAL_JS_RAW_LIMIT_BYTES,
} = BUNDLE_SIZE_LIMITS;
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

const productionBuild = await build({
  build: { write: false },
  logLevel: "silent",
  mode: "production",
});
const productionOutputs = (Array.isArray(productionBuild) ? productionBuild : [productionBuild]).flatMap(
  ({ output }) => output
);
const sentryOutputChunk = identifySentryChunk(productionOutputs.filter((output) => output.type === "chunk"));
const pushOutputChunks = productionOutputs.filter(
  (output) => output.type === "chunk" && output.facadeModuleId?.endsWith("/src/notificationPushRuntimeComposition.ts")
);
assert.equal(pushOutputChunks.length, 1, "Push runtime must remain one identifiable lazy entry");
const pushOutputChunk = pushOutputChunks[0];
assert.equal(pushOutputChunk.isDynamicEntry, true, "Push runtime must load on demand");
assert.ok(
  !productionOutputs.some(
    (output) =>
      output.type === "chunk" &&
      output.isEntry &&
      Object.keys(output.modules).some((id) =>
        /\/src\/notificationPush(?:Storage|UserActions|RuntimeComposition)\.ts$/u.test(id)
      )
  ),
  "Push runtime or storage leaked into initial JavaScript"
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
const initialOutputChunks = collectInitialJavaScriptChunks(
  productionOutputs.filter((chunk) => chunk.type === "chunk"),
  entryScripts
);
const guideEntry = productionOutputs.find(
  (chunk) => chunk.type === "chunk" && chunk.facadeModuleId?.endsWith("/src/guides/guideClient.ts")
);
assert.ok(guideEntry, "guide entry is missing");
const guideInitialChunks = collectInitialJavaScriptChunks(
  productionOutputs.filter((chunk) => chunk.type === "chunk"),
  [guideEntry.fileName]
);
const allInitialChunks = [...new Set([...initialOutputChunks, ...guideInitialChunks])];
const initialChunkFiles = new Set(allInitialChunks.map((chunk) => fileURLToPath(new URL(chunk.fileName, DIST_DIR))));
for (const chunk of guideInitialChunks) {
  assert.ok(
    !Object.keys(chunk.modules).some((id) => /\/src\/(?:map|pins|main)\.(?:ts|js)$/u.test(id)),
    "Maps/application shell leaked into guide startup"
  );
}
for (const chunk of allInitialChunks) {
  assert.equal(
    readFileSync(new URL(chunk.fileName, DIST_DIR), "utf8"),
    chunk.code,
    `dist initial output differs from the verified production build: ${chunk.fileName}`
  );
  assert.ok(
    chunk !== sentryOutputChunk && chunk !== pushOutputChunk,
    `on-demand runtime leaked into initial JavaScript: ${chunk.fileName}`
  );
  assert.ok(
    !chunk.code.includes("tennis_private_data_repository_v1"),
    `private repository leaked into initial JavaScript: ${chunk.fileName}`
  );
  assert.ok(
    !Object.keys(chunk.modules).some((id) =>
      /\/src\/notificationPush(?:Storage|UserActions|RuntimeComposition)\.ts$/u.test(id)
    ),
    `Push runtime or storage leaked into initial JavaScript: ${chunk.fileName}`
  );
}
const initialRawBytes = initialOutputChunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0);
const initialGzipBytes = initialOutputChunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0);
const mainChunk = readFileSync(new URL(`../dist/${mainChunkPath}`, import.meta.url));
const mainChunkBrotliBytes = brotliCompressSync(mainChunk).length;
const mainChunkGzipBytes = gzipSync(mainChunk).length;
const mainChunkFile = fileURLToPath(new URL(mainChunkPath, DIST_DIR));
const javascriptChunks = outputFiles
  .filter((file) => file.endsWith(".js"))
  .map((file) => {
    const source = readFileSync(file);
    return {
      brotliBytes: brotliCompressSync(source).length,
      file,
      gzipBytes: gzipSync(source).length,
      rawBytes: source.length,
      source,
    };
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
const sentryChunkFile = fileURLToPath(new URL(sentryOutputChunk.fileName, DIST_DIR));
const sentryChunk = javascriptChunks.find(({ file }) => file === sentryChunkFile);
assert.ok(sentryChunk, `verified Sentry output is absent from dist: ${sentryOutputChunk.fileName}`);
assert.equal(
  sentryChunk.source.toString("utf8"),
  sentryOutputChunk.code,
  `dist Sentry output differs from the verified production build: ${sentryOutputChunk.fileName}`
);
assert.ok(sentryChunk.source.includes(sentryMarker), "verified Sentry chunk lost its SDK marker");
const sentryChunks = [sentryChunk];
const privateDataMarker = "tennis_private_data_repository_v1";
assert.ok(!mainChunk.includes(privateDataMarker), `private repository leaked into the main chunk: ${mainChunkPath}`);
const privateDataChunks = javascriptChunks.filter(
  ({ file, source }) => file !== mainChunkFile && source.includes(privateDataMarker)
);
assert.equal(privateDataChunks.length, 1, `expected one private repository chunk, found ${privateDataChunks.length}`);

const byteChecks = [
  {
    actualBytes: initialRawBytes,
    limitBytes: BUNDLE_SIZE_LIMITS.initialRawBytes,
    name: "production initial static JavaScript raw",
  },
  {
    actualBytes: initialGzipBytes,
    limitBytes: BUNDLE_SIZE_LIMITS.initialGzipBytes,
    name: "production initial static JavaScript gzip",
  },
  {
    actualBytes: mainChunk.length,
    limitBytes: MAIN_CHUNK_RAW_LIMIT_BYTES,
    name: `production main chunk raw (${mainChunkPath})`,
  },
  {
    actualBytes: mainChunkGzipBytes,
    limitBytes: MAIN_CHUNK_GZIP_LIMIT_BYTES,
    name: `production main chunk gzip (${mainChunkPath})`,
  },
];
byteChecks.push(
  {
    actualBytes: guideInitialChunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0),
    limitBytes: BUNDLE_SIZE_LIMITS.initialRawBytes,
    name: "guide initial static JavaScript raw",
  },
  {
    actualBytes: guideInitialChunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0),
    limitBytes: BUNDLE_SIZE_LIMITS.initialGzipBytes,
    name: "guide initial static JavaScript gzip",
  }
);
for (const chunk of javascriptChunks.filter(({ file }) => !initialChunkFiles.has(file))) {
  const isSentry = sentryChunks.includes(chunk);
  const isPush = chunk.file === fileURLToPath(new URL(pushOutputChunk.fileName, DIST_DIR));
  const rawLimit = isSentry
    ? SENTRY_CHUNK_RAW_LIMIT_BYTES
    : isPush
      ? BUNDLE_SIZE_LIMITS.pushRawBytes
      : LAZY_CHUNK_RAW_LIMIT_BYTES;
  const gzipLimit = isSentry
    ? SENTRY_CHUNK_GZIP_LIMIT_BYTES
    : isPush
      ? BUNDLE_SIZE_LIMITS.pushGzipBytes
      : LAZY_CHUNK_GZIP_LIMIT_BYTES;
  const name = chunk.file.split("/").at(-1);
  byteChecks.push(
    { actualBytes: chunk.rawBytes, limitBytes: rawLimit, name: `production lazy chunk raw (${name})` },
    { actualBytes: chunk.gzipBytes, limitBytes: gzipLimit, name: `production lazy chunk gzip (${name})` }
  );
}

const totalJavaScriptRawBytes = javascriptChunks.reduce((total, chunk) => total + chunk.rawBytes, 0);
const totalJavaScriptGzipBytes = javascriptChunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);
const totalJavaScriptBrotliBytes = javascriptChunks.reduce((total, chunk) => total + chunk.brotliBytes, 0);
byteChecks.push(
  {
    actualBytes: totalJavaScriptRawBytes,
    limitBytes: TOTAL_JS_RAW_LIMIT_BYTES,
    name: "production JavaScript raw total",
  },
  {
    actualBytes: totalJavaScriptGzipBytes,
    limitBytes: TOTAL_JS_GZIP_LIMIT_BYTES,
    name: "production JavaScript gzip total",
  }
);
const exceededByteLimits = applyByteLimitPolicy(byteChecks, {
  mode: byteLimitMode,
  onReport: (message) => console.warn(message),
});

const largestApplicationLazyChunk = javascriptChunks
  .filter(
    (chunk) =>
      !initialChunkFiles.has(chunk.file) &&
      !sentryChunks.includes(chunk) &&
      chunk.file !== fileURLToPath(new URL(pushOutputChunk.fileName, DIST_DIR))
  )
  .sort((left, right) => right.rawBytes - left.rawBytes)[0];

console.log(
  `initial static JS (${initialOutputChunks.length} chunks) raw/gzip ${initialRawBytes}/${initialGzipBytes} budget ${BUNDLE_SIZE_LIMITS.initialRawBytes}/${BUNDLE_SIZE_LIMITS.initialGzipBytes}; dynamic startup loads and external Maps/fonts require browser measurement`
);
console.log(
  `production bundle structural checks passed: development E2E hook present, production E2E hook absent; ${outputFiles.length} files, ${DEMO_IDENTIFIERS.length} demo identifiers absent; byte mode ${byteLimitMode}, ${exceededByteLimits.length} exceeded; sizes raw/gzip/brotli; main ${mainChunk.length}/${mainChunkGzipBytes}/${mainChunkBrotliBytes} budget raw/gzip ${MAIN_CHUNK_RAW_LIMIT_BYTES}/${MAIN_CHUNK_GZIP_LIMIT_BYTES}; largest app lazy ${largestApplicationLazyChunk.file.split("/").at(-1)} ${largestApplicationLazyChunk.rawBytes}/${largestApplicationLazyChunk.gzipBytes}/${largestApplicationLazyChunk.brotliBytes} budget raw/gzip ${LAZY_CHUNK_RAW_LIMIT_BYTES}/${LAZY_CHUNK_GZIP_LIMIT_BYTES}; total JS ${totalJavaScriptRawBytes}/${totalJavaScriptGzipBytes}/${totalJavaScriptBrotliBytes} budget raw/gzip ${TOTAL_JS_RAW_LIMIT_BYTES}/${TOTAL_JS_GZIP_LIMIT_BYTES}; private repository: ${privateDataChunks[0].file.split("/").at(-1)}; Sentry: ${sentryChunks.map(({ file }) => file.split("/").at(-1)).join(", ")}`
);

console.log(
  `guide static JS raw/gzip ${guideInitialChunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0)}/${guideInitialChunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0)}; Maps absent; index JS 0`
);
