import assert from "node:assert/strict";
import test from "node:test";
import { guides, renderGuidePage } from "../scripts/courtGuidePages.mjs";
import { resolveGuideCourt } from "../src/features/guides/courtGuideLinks.ts";
import { consumeGuideEntry, subscriptionGuideHint } from "../src/features/guides/guideEntry.ts";
import { readPendingIntent, savePendingIntent } from "../src/sessionIntent.ts";
import { samePendingIntent } from "../src/features/profile-auth/profileAuthFeature.ts";
import { createSessionDraft } from "../src/features/session-lifecycle/repeatSessionDraft.ts";
import { createDataApi } from "../src/dataApi.ts";
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test("all published guides have crawlable, sourced static content and production canonicals", () => {
  assert.equal(guides.length, 15);
  const index = renderGuidePage(null, { production: true });
  assert.doesNotMatch(index, /<script|noindex|maps.googleapis/);
  for (const guide of guides) {
    const html = renderGuidePage(guide.slug, { production: true, now: Date.parse("2026-09-09") });
    assert.ok(index.includes(`/courts/${guide.slug}/`));
    assert.ok(html.includes(`<h1>${guide.name}</h1>`));
    for (const text of ["租借方式", "開放與設施", "交通方式", "資料來源", "未來 14 天・已定場", "2026/09/09"])
      assert.ok(html.includes(text));
    for (const fact of guide.facts) assert.ok(guide.sources[fact.source]);
    const court = { id: 123, name: guide.name };
    assert.equal(resolveGuideCourt(guide.slug, [court]), court);
    const store = storage();
    savePendingIntent({ action: "create", courtSlug: guide.slug }, store);
    assert.equal(readPendingIntent(store).courtSlug, guide.slug);
    assert.ok(guide.sources[guide.bookingSource]);
    assert.ok(guide.sources[guide.transportSource]);
    assert.match(renderGuidePage(guide.slug, { now: Date.parse("2027-01-01") }), /資訊已超過 90 天未查核/);
  }
  assert.equal(renderGuidePage("not-a-guide"), null);
  assert.match(renderGuidePage(null), /noindex/);
});

test("guide context permits only public slugs and carries no draft through login", () => {
  const store = storage();
  savePendingIntent({ action: "create", courtSlug: "youth-park" }, store);
  assert.deepEqual(readPendingIntent(store), { action: "create", courtSlug: "youth-park" });
  for (const extra of [{ courtId: 3 }, { courtSlug: "unknown" }, { courtSlug: "youth-park", note: "private" }])
    assert.throws(() => savePendingIntent({ action: "create", ...extra }, store));
  assert.equal(samePendingIntent(readPendingIntent(store), { action: "create" }), false);
  assert.equal(
    samePendingIntent(readPendingIntent(store), { action: "create", courtSlug: "rainbow-riverside" }),
    false
  );
  const courts = [{ id: 79, name: "青年公園網球場" }];
  assert.equal(resolveGuideCourt("youth-park", courts)?.id, 79);
  assert.equal(resolveGuideCourt("youth-park", [...courts, ...courts]), null);
  assert.equal(resolveGuideCourt("youth-park", []), null);
  assert.equal(createSessionDraft(undefined, [79], 79).court, 79);
  assert.equal(createSessionDraft(undefined, [80], 79).court, null);
  assert.equal(createSessionDraft(undefined, [79], 79).time, null);
});

test("guide URL is consumed once and subscription hints expire or clear on account changes", () => {
  const store = storage();
  const history = {
    state: { keep: 1 },
    replaceState(...args) {
      this.call = args;
    },
  };
  const entry = consumeGuideEntry(
    { href: "https://qiuka.tw/?code=oauth&courtGuide=youth-park&guideAction=subscribe#tab-me" },
    history,
    store
  );
  assert.deepEqual(entry, { slug: "youth-park", action: "subscribe" });
  assert.deepEqual(history.call, [history.state, "", "/?code=oauth#tab-me"]);
  assert.equal(subscriptionGuideHint(null, store), "青年公園網球場");
  assert.equal(subscriptionGuideHint("a", store), "青年公園網球場");
  assert.equal(subscriptionGuideHint("b", store), null);
  assert.equal(
    consumeGuideEntry(
      { href: "https://qiuka.tw/?courtGuide=youth-park&courtGuide=rainbow-riverside&guideAction=create" },
      history,
      store
    ),
    null
  );
});

test("guide query filters exact court and the future window before a deterministic 3+1 limit", async () => {
  const calls = [];
  const query = {};
  for (const method of ["select", "eq", "gte", "lt", "or", "order"])
    query[method] = (...args) => {
      calls.push([method, ...args]);
      return query;
    };
  query.limit = (count) => {
    calls.push(["limit", count]);
    return Promise.resolve({ data: [], error: null });
  };
  const api = createDataApi({
    configured: true,
    now: new Date("2026-09-09T00:00:00Z"),
    client: {
      from(name) {
        assert.equal(name, "session_discovery");
        return query;
      },
    },
  });
  assert.deepEqual(await api.loadCourtGuideSessions(79), []);
  assert.deepEqual(calls.slice(1), [
    ["eq", "court_id", 79],
    ["gte", "start_at", "2026-09-09T00:00:00.000Z"],
    ["lt", "start_at", "2026-09-23T00:00:00.000Z"],
    ["or", "venue_type.neq.candidates,decided_at.not.is.null"],
    ["order", "start_at", { ascending: true }],
    ["order", "session_id", { ascending: true }],
    ["limit", 4],
  ]);
  await assert.rejects(() => api.loadCourtGuideSessions(0));
});
