import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { handleSharePage, SHARE_SELECT, shareId } from "../server/sharePage.js";
import { normalizeShareRoute } from "../src/features/share/shareRoute.ts";

const template =
  '<html><head><title>品牌</title><meta property="og:title" content="品牌"><meta property="og:url" content="https://qiuka.tw/"><meta name="description" content="品牌"><script type="module" src="/assets/app-real-build.js"></script></head><body><div id="app"></div></body></html>';
const env = {
  VERCEL_ENV: "production",
  VITE_SUPABASE_URL: "https://public.example.test",
  VITE_SUPABASE_ANON_KEY: "public-key",
};
const row = {
  session_id: 42,
  court: '球場"<script>alert(1)</script>',
  start_at: "2099-01-02T12:00:00Z",
  play_type: "雙打",
  ntrp_min: 3,
  ntrp_max: 4,
  slots_remaining: 1,
  status: "open",
  venue_type: "walk_on",
  notes: "SECRET-NOTES",
  host_nickname: "SECRET-HOST",
};
const run = (rows = [row], options = {}) =>
  handleSharePage(new Request("https://untrusted.test/s/42", { method: options.method || "GET" }), {
    template,
    env,
    fetchImpl: async () => Response.json(rows),
    ...options,
  });

test("share response has per-session server HTML, preserves assets and escapes only allowed fields", async () => {
  const response = await run();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /20:00/);
  assert.match(html, /NTRP 3.0–4.0/);
  assert.match(html, /缺 1 位/);
  assert.match(html, /&quot;&lt;script&gt;alert/);
  assert.doesNotMatch(html, /<script>alert|SECRET-|untrusted.test/);
  assert.equal([...html.matchAll(/property="og:title"/g)].length, 1);
  assert.match(html, /https:\/\/qiuka.tw\/s\/42/);
  assert.match(html, /app-real-build.js/);
});
test("backend gets fixed public select without visitor auth or arbitrary URL", async () => {
  await run([], {
    fetchImpl: async (url, init) => {
      assert.equal(url.origin, "https://public.example.test");
      assert.equal(url.pathname, "/rest/v1/session_discovery");
      assert.equal(url.searchParams.get("select"), SHARE_SELECT);
      assert.equal(url.searchParams.get("session_id"), "eq.42");
      assert.deepEqual(init.headers, { apikey: "public-key" });
      assert.equal(init.redirect, "error");
      return Response.json([]);
    },
  });
});
test("missing, expired, private or cancelled rows use same neutral response", async () => {
  for (const rows of [
    [],
    [{ ...row, status: "cancelled" }],
    [{ ...row, status: "played" }],
    [{ ...row, session_id: 43 }],
    [{ ...row, start_at: "2000-01-01" }],
  ]) {
    const response = await run(rows);
    const html = await response.text();
    assert.equal(response.status, 404);
    assert.match(html, /目前無法查看/);
    assert.doesNotMatch(html, /已取消|已過期|SECRET|20:00/);
  }
});
test("failures and malformed responses do not turn into empty results or leak provider errors", async () => {
  for (const fetchImpl of [
    async () => {
      throw new Error("SECRET-provider");
    },
    async () => new Response("SECRET", { status: 500 }),
    async () => Response.json({ error: "SECRET" }),
  ]) {
    const response = await run([], { fetchImpl });
    assert.equal(response.status, 503);
    const html = await response.text();
    assert.match(html, /暫時無法載入/);
    assert.doesNotMatch(html, /SECRET|目前未公開/);
  }
});
test("candidate time, confirmed court and full status do not misrepresent availability", async () => {
  const candidate = await (await run([{ ...row, venue_type: "candidates", range_end: "2099-01-02T14:00:00Z" }])).text();
  assert.match(candidate, /候選球場未定案/);
  assert.match(candidate, /20:00～22:00/);
  assert.doesNotMatch(candidate, /alert/);
  const full = await (
    await run([{ ...row, status: "full", venue_type: "candidates", decided_at: row.start_at }])
  ).text();
  assert.match(full, /已額滿/);
  assert.match(full, /訂場待確認/);
  assert.doesNotMatch(full, /缺 1 位/);
});
test("candidate expires at start, ordinary session at two-hour boundary", async () => {
  const now = () => Date.parse(row.start_at);
  assert.equal((await run([{ ...row, venue_type: "candidates" }], { now })).status, 404);
  assert.equal((await run([row], { now })).status, 200);
  assert.equal((await run([row], { now: () => now() + 7_200_000 })).status, 404);
});
test("strict path, safe integer and duplicate parameter validation", () => {
  for (const path of [
    "/s/0",
    "/s/01",
    "/s/-1",
    "/s/42foo",
    "/s/9007199254740992",
    "/api/share?id=42&id=43",
    "/s/42?id=43",
    "/other?id=42",
  ])
    assert.equal(shareId(new URL(path, "https://example.test")), null);
  for (const path of ["/s/42", "/s/42/", "/s/42?id=42", "/api/share?id=42"])
    assert.equal(shareId(new URL(path, "https://example.test")), 42);
});
test("HEAD has same status/metadata headers and no body; POST never reads database", async () => {
  const head = await run([], { method: "HEAD" });
  assert.equal(head.status, 404);
  assert.equal(await head.text(), "");
  let called = false;
  const post = await run([], {
    method: "POST",
    fetchImpl: async () => {
      called = true;
      return Response.json([]);
    },
  });
  assert.equal(post.status, 405);
  assert.equal(called, false);
});
test("new route normalizes before app boot without extra history, preserving explicit hash/auth query", () => {
  const calls = [];
  const history = { state: { preserved: true }, replaceState: (...args) => calls.push(args) };
  assert.equal(normalizeShareRoute({ pathname: "/s/42", search: "?code=test", hash: "" }, history), true);
  assert.deepEqual(calls[0], [history.state, "", "/?code=test#/session/42"]);
  normalizeShareRoute({ pathname: "/s/42", search: "", hash: "#tab-me" }, history);
  assert.equal(calls[1][2], "/#tab-me");
  assert.equal(normalizeShareRoute({ pathname: "/", search: "", hash: "#/session/42" }, history), false);
});
test("raw HTTP GET and HEAD expose metadata before any JavaScript runs", async () => {
  const server = createServer(async (req, res) => {
    const result = await handleSharePage(new Request(`http://localhost${req.url}`, { method: req.method }), {
      template,
      env,
      fetchImpl: async () => Response.json([row]),
    });
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}/s/42`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /property="og:title"/);
    assert.equal(await (await fetch(url, { method: "HEAD" })).text(), "");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("valid pages advertise versioned per-session PNG; unavailable pages retain neutral brand image", async () => {
  const html = await (await run()).text();
  assert.match(html, /og:image" content="https:\/\/qiuka.tw\/api\/share-image\?id=42&amp;v=[a-f0-9]{16}"/);
  assert.match(html, /og:image:type" content="image\/png"/);
  const missing = await (await run([])).text();
  assert.match(missing, /og:image" content="https:\/\/qiuka.tw\/og.png"/);
  assert.doesNotMatch(missing, /share-image/);
});
