import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const bundle = resolve(root, ".vercel/output/functions/api/share-image.func");
const config = JSON.parse(await readFile(join(bundle, ".vc-config.json"), "utf8"));
const staged = await mkdtemp(join(tmpdir(), "qiuka-share-image-function-"));
const oldFetch = globalThis.fetch;
const originalEnv = { ...process.env };
try {
  await cp(bundle, staged, { recursive: true });
  for (const [destination, source] of Object.entries(config.filePathMap || {})) {
    assert.ok(!destination.startsWith("/") && !destination.split("/").includes(".."));
    await mkdir(dirname(join(staged, destination)), { recursive: true });
    await cp(resolve(root, source), join(staged, destination), { recursive: true });
  }
  for (const weight of ["Regular", "Bold"])
    assert.ok((await stat(join(staged, `server/fonts/NotoSerifCJKtc-${weight}.otf`))).size > 1_000_000);
  Object.assign(process.env, {
    VITE_SUPABASE_URL: "https://fixture.invalid",
    VITE_SUPABASE_ANON_KEY: "fixture-key",
  });
  globalThis.fetch = async () =>
    Response.json([
      {
        session_id: 42,
        court: "大佳河濱網球場",
        start_at: "2099-01-02T11:00:00Z",
        play_type: "雙打",
        ntrp_min: 3,
        ntrp_max: 3.5,
        slots_remaining: 1,
        status: "open",
        venue_type: "booked",
      },
    ]);
  process.chdir(staged);
  const { default: handler } = await import(pathToFileURL(join(staged, config.handler)));
  const response = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
    },
  };
  await handler({ url: "/api/share-image?id=42", method: "GET" }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.ok(Buffer.isBuffer(response.body));
  assert.equal(response.body.readUInt32BE(16), 1200);
  assert.equal(response.body.readUInt32BE(20), 630);
  assert.ok(response.body.length > 20000, "Expected rendered text, not an empty court background");
  console.log("Isolated Vercel image bundle: font and native renderer present; 1200×630 binary PNG returned.");
} finally {
  process.chdir(root);
  globalThis.fetch = oldFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  await rm(staged, { recursive: true, force: true });
}
