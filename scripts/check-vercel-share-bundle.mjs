import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const bundle = resolve(root, ".vercel/output/functions/api/share.func");
const config = JSON.parse(await readFile(join(bundle, ".vc-config.json"), "utf8"));
const staged = await mkdtemp(join(tmpdir(), "qiuka-share-function-"));
const oldFetch = globalThis.fetch;
const originalEnv = { ...process.env };
try {
  await cp(bundle, staged, { recursive: true });
  // Vercel deliberately leaves FileFsRef assets in the project and packages them via this map.
  for (const [destination, source] of Object.entries(config.filePathMap || {})) {
    assert.ok(!destination.startsWith("/") && !destination.split("/").includes(".."));
    await cp(resolve(root, source), join(staged, destination), { recursive: true });
  }
  const template = await readFile(join(staged, "server-generated/share-shell.html"), "utf8");
  assert.equal(template, await readFile(resolve(root, ".vercel/output/static/index.html"), "utf8"));
  for (const [, asset] of template.matchAll(/(?:src|href)="\/(assets\/[^"?]+)"/g))
    await stat(resolve(root, ".vercel/output/static", asset));
  Object.assign(process.env, {
    VERCEL_ENV: "production",
    VITE_SUPABASE_URL: "https://fixture.invalid",
    VITE_SUPABASE_ANON_KEY: "fixture-key",
  });
  globalThis.fetch = async () =>
    Response.json([
      {
        session_id: 42,
        court: "測試球場",
        start_at: new Date(Date.now() + 86400000).toISOString(),
        play_type: "單打",
        slots_remaining: 1,
        status: "open",
        venue_type: "booked",
      },
    ]);
  const { default: handler } = await import(pathToFileURL(join(staged, config.handler)));
  process.chdir(staged);
  const response = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
    },
  };
  await handler({ url: "/api/share?id=42", method: "GET" }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /測試球場/);
  assert.match(response.body, /property="og:title"/);
  assert.equal(response.headers["cache-control"], "no-store");
  console.log(
    "Vercel share bundle: mapped template present, matches deployed static shell, assets resolve, staged function returns 200 with OG metadata."
  );
} finally {
  process.chdir(root);
  globalThis.fetch = oldFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  await rm(staged, { recursive: true, force: true });
}
