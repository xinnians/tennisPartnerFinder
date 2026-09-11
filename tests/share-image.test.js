import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { handleShareImage, renderShareCardSvg, shareCardContent } from "../server/shareImage.js";
import { shareImagePath, SHARE_SELECT } from "../server/sharePage.js";
import handler from "../api/share-image.js";

const row = {
  session_id: 42,
  start_at: "2099-01-02T16:30:00Z",
  court: "大佳河濱網球場",
  play_type: "雙打",
  ntrp_min: 3,
  ntrp_max: 3.5,
  status: "open",
  slots_remaining: 1,
  venue_type: "booked",
};
const env = { VITE_SUPABASE_URL: "https://example.test", VITE_SUPABASE_ANON_KEY: "public-key" };
const run = (rows = [row], path = "/api/share-image?id=42", method = "GET", extra = {}) =>
  handleShareImage(
    new Request(`https://example.test${path}`, { method, headers: { Authorization: "SECRET", Cookie: "SECRET" } }),
    {
      env,
      fetchImpl: async () => Response.json(rows),
      ...extra,
    }
  );

test("real PNG dimensions, binary response and no-store; backend is anonymous and fixed", async () => {
  const result = await run([row], undefined, undefined, {
    fetchImpl: async (url, init) => {
      assert.equal(url.pathname, "/rest/v1/session_discovery");
      assert.equal(url.searchParams.get("select"), SHARE_SELECT);
      assert.equal(url.searchParams.get("session_id"), "eq.42");
      assert.deepEqual(init.headers, { apikey: "public-key" });
      return Response.json([row]);
    },
  });
  const bytes = Buffer.from(await result.arrayBuffer());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "image/png");
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
});

test("Taipei rollover, long names, venue truth and public field boundary", () => {
  const content = shareCardContent({ ...row, notes: "SECRET", host_nickname: "SECRET" });
  assert.equal(content.date, "01.03");
  assert.match(content.time, /00:30/);
  assert.equal(content.year, "2099 · 台北時間");
  assert.equal(content.venue, "已訂場");
  assert.doesNotMatch(JSON.stringify(content), /SECRET|缺.*位/);
  const candidate = shareCardContent({ ...row, venue_type: "candidates", range_end: "2099-01-02T18:00:00Z" });
  assert.equal(candidate.court, "候選球場未定案");
  assert.match(candidate.time, /00:30–02:00/);
  assert.doesNotMatch(JSON.stringify(candidate), /大佳|已訂場/);
  assert.equal(
    shareCardContent({ ...row, status: "full", venue_type: "candidates", decided_at: row.start_at }).venue,
    "已額滿 · 已定案，訂場待確認"
  );
  const svg = renderShareCardSvg({ ...content, court: '<script>SECRET</script>&"' });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  const long = renderShareCardSvg({ ...content, court: "場".repeat(100) });
  assert.match(long, /…/);
  assert.doesNotMatch(long, /場{16}/);
});

test("unavailable rows and provider failures never disclose the old card", async () => {
  for (const rows of [
    [],
    [{ ...row, status: "cancelled" }],
    [{ ...row, status: "played" }],
    [{ ...row, start_at: "2000-01-01" }],
    [{ ...row, session_id: 43 }],
  ]) {
    assert.equal((await run(rows, undefined, "HEAD")).status, 404);
  }
  const result = await run([], undefined, "GET", {
    fetchImpl: async () => {
      throw new Error("SECRET");
    },
  });
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("content-type"), "image/png");
  assert.doesNotMatch(Buffer.from(await result.arrayBuffer()).toString(), /SECRET/);
  assert.doesNotMatch(renderShareCardSvg(shareCardContent(null)), /大佳|2099|已取消/);
});

test("invalid ids and methods do not query; HEAD is bodyless", async () => {
  const extra = {
    fetchImpl: () => {
      throw new Error("must not query");
    },
  };
  for (const path of [
    "/api/share-image?id=0",
    "/api/share-image?id=01",
    "/api/share-image?id=42&id=43",
    "/api/share-image?id=9007199254740992",
    "/other?id=42",
  ])
    assert.equal((await run([], path, "GET", extra)).status, 404);
  assert.equal((await run([], undefined, "POST", extra)).status, 405);
  const head = await run([row], undefined, "HEAD");
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test("revisions change with displayed data but not private fields or open vacancy count", () => {
  const original = shareImagePath(row);
  assert.notEqual(shareImagePath({ ...row, court: "另一座球場" }), original);
  assert.notEqual(shareImagePath({ ...row, status: "full" }), original);
  assert.equal(shareImagePath({ ...row, notes: "SECRET", slots_remaining: 2 }), original);
});

test("Vercel adapter returns binary PNG without UTF-8 corruption", async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.VITE_SUPABASE_URL;
  const oldKey = process.env.VITE_SUPABASE_ANON_KEY;
  try {
    process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
    globalThis.fetch = async () => Response.json([row]);
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(body) {
        this.body = body;
      },
    };
    await handler({ url: "/api/share-image?id=42", method: "GET" }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.readUInt32BE(16), 1200);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
    else process.env.VITE_SUPABASE_ANON_KEY = oldKey;
  }
});

test("Vite HTTP share HTML leads to a compact JPEG; HEAD and unavailable routes work", async () => {
  const { createServer: createHttpServer } = await import("node:http");
  const { once } = await import("node:events");
  const { createServer: createViteServer } = await import("vite");
  const { sharePagePlugin } = await import("../scripts/sharePagePlugin.mjs");
  const backend = createHttpServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    assert.equal(url.pathname, "/rest/v1/session_discovery");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(url.searchParams.get("session_id") === "eq.42" ? [row] : []));
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const originalEnv = { ...process.env };
  let vite;
  try {
    process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${backend.address().port}`;
    process.env.VITE_SUPABASE_ANON_KEY = "fixture-key";
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    vite = await createViteServer({
      configFile: false,
      plugins: [sharePagePlugin()],
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "silent",
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const page = await fetch(`${origin}/s/42`);
    assert.equal(page.status, 200);
    const html = await page.text();
    const image = new URL(/property="og:image" content="([^"]+)"/.exec(html)[1].replaceAll("&amp;", "&"));
    assert.equal(image.origin, origin);
    const response = await fetch(image);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length < 300_000, `Preview should stay compact: ${bytes.length}`);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 630);
    assert.equal(metadata.format, "jpeg");
    assert.equal(
      (await (await fetch(`${origin}${image.pathname}${image.search}`, { method: "HEAD" })).arrayBuffer()).byteLength,
      0
    );
    assert.equal((await fetch(`${origin}/api/share-image?id=99`)).status, 404);
  } finally {
    await vite?.close();
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test("nine-character court name remains on one line without colliding with the time", () => {
  const svg = renderShareCardSvg(shareCardContent({ ...row, court: "延平河濱公園網球場" }));
  assert.match(svg, />延平河濱公園網球場<\/text>/);
  assert.doesNotMatch(svg, />場<\/text>/);
});
