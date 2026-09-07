import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPageRouteOwner, pageFromHash, pageFromTabId } from "../src/features/navigation/pageRouteOwner.ts";
import { sessionIdFromHash } from "../src/sessionRoute.js";

function createPageRouteHarness({ authIdentity = "account-a", hash = "#tab-map", historyOwner = null } = {}) {
  const events = [];
  const hidden = new Map();
  const state = { authIdentity, hash, historyOwner };
  const owner = createPageRouteOwner({
    collapseDrawer: () => events.push("collapse"),
    getAuthIdentity: () => state.authIdentity,
    getHash: () => state.hash,
    getHistoryOwnerIdentity: () => state.historyOwner,
    onEnter: (page) => events.push(`enter:${page}`),
    scheduleFocus: ({ preventScroll, selector }) => events.push(`focus:${selector}:${preventScroll}`),
    setPageHidden: (elementId, value) => {
      hidden.set(elementId, value);
      events.push(`hidden:${elementId}:${value}`);
    },
    syncNavigation: (page) => events.push(`sync:${page}`),
    writeHistory: (mode, value, nextHash) => {
      state.hash = nextHash;
      state.historyOwner = value.pageOwnerIdentity;
      events.push(`history:${mode}:${nextHash}:${value.pageOwnerIdentity}`);
    },
  });
  return { events, hidden, owner, state };
}

function retiredMainRouteFindings(source) {
  const findings = [];
  for (const symbol of ["pageFromHash", "setActivePage", "showMessagesPage", "reconcilePageRouteOwner"]) {
    if (new RegExp(`function\\s+${symbol}\\b`).test(source)) findings.push(symbol);
  }
  if (/\b(?:const|let|var)\s+PAGE_ROUTES\b/.test(source)) findings.push("PAGE_ROUTES");
  if (/destination\s*===\s*["']messages-tab["']/.test(source)) findings.push("messages-tab-branch");
  if (/data-messages-heading/.test(source)) findings.push("messages-heading-focus");
  return findings;
}

test("session hash route accepts only a positive safe integer id", () => {
  assert.equal(sessionIdFromHash("#/session/42"), 42);
  assert.equal(sessionIdFromHash("#/session/9001"), 9001);
});

test("session hash route rejects malformed, unsafe, and unrelated hashes", () => {
  for (const hash of [
    "",
    "#/session/",
    "#/session/0",
    "#/session/-1",
    "#/session/01",
    "#/session/1/extra",
    "#/sessions/1",
    "#/session/9007199254740992",
  ]) {
    assert.equal(sessionIdFromHash(hash), null, hash);
  }
});

test("page route lookup has one source for hashes and bottom-navigation tab ids", () => {
  assert.equal(pageFromHash("#tab-map"), "map");
  assert.equal(pageFromHash("#tab-my-sessions"), "my-sessions");
  assert.equal(pageFromHash("#tab-messages"), "messages");
  assert.equal(pageFromHash("#tab-me"), "me");
  assert.equal(pageFromHash("#/session/42"), null);
  assert.equal(pageFromTabId("messages-tab"), "messages");
  assert.equal(pageFromTabId("create-session-tab"), null);
});

test("Messages click, deep link, back-forward and heading focus use the same route owner", () => {
  const harness = createPageRouteHarness();

  assert.equal(harness.owner.navigate(harness.owner.pageFromTabId("messages-tab"), { focusTarget: "page" }), true);
  assert.equal(harness.owner.getActivePage(), "messages");
  assert.equal(harness.state.hash, "#tab-messages");
  assert.equal(harness.hidden.get("messages-page"), false);
  assert.equal(harness.hidden.get("tab-map"), true);
  assert.ok(harness.events.includes("history:push:#tab-messages:account-a"));
  assert.ok(harness.events.includes("focus:#messages-root [data-messages-heading]:true"));

  harness.events.length = 0;
  harness.state.hash = "#tab-me";
  assert.equal(harness.owner.routeCurrentHash(), true);
  assert.equal(harness.owner.getActivePage(), "me");
  assert.equal(
    harness.events.some((event) => event.startsWith("history:")),
    false
  );

  harness.events.length = 0;
  harness.state.hash = "#tab-messages";
  assert.equal(harness.owner.routeCurrentHash(), true);
  assert.equal(harness.owner.getActivePage(), "messages");
  assert.equal(
    harness.events.some((event) => event.startsWith("history:")),
    false
  );
});

test("page owner replaces private or changed-account history with the public map", () => {
  const accountSwitch = createPageRouteHarness({
    authIdentity: "account-b",
    hash: "#tab-messages",
    historyOwner: "account-a",
  });
  assert.equal(accountSwitch.owner.reconcile(), true);
  assert.equal(accountSwitch.owner.getActivePage(), "map");
  assert.ok(accountSwitch.events.includes("history:replace:#tab-map:account-b"));

  const signedOut = createPageRouteHarness({ authIdentity: null, hash: "#tab-my-sessions", historyOwner: "account-a" });
  assert.equal(signedOut.owner.reconcile({ forcePublic: true }), true);
  assert.equal(signedOut.state.hash, "#tab-map");

  const publicMe = createPageRouteHarness({ authIdentity: null, hash: "#tab-me", historyOwner: "account-a" });
  assert.equal(publicMe.owner.reconcile({ forcePublic: true }), false);
  assert.equal(publicMe.state.hash, "#tab-me");
});

test("page route owner is dependency-free and retired Messages main bridges have negative canaries", async () => {
  const [mainSource, ownerSource] = await Promise.all([
    readFile(new URL("../src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../src/features/navigation/pageRouteOwner.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(ownerSource, /^\s*import\s/m);
  assert.deepEqual(retiredMainRouteFindings(mainSource), []);
  assert.deepEqual(retiredMainRouteFindings(`${mainSource}\nfunction showMessagesPage() {}`), ["showMessagesPage"]);
  assert.deepEqual(retiredMainRouteFindings(`${mainSource}\nif (destination === "messages-tab") {}`), [
    "messages-tab-branch",
  ]);
  assert.deepEqual(retiredMainRouteFindings(`${mainSource}\ndocument.querySelector("[data-messages-heading]")`), [
    "messages-heading-focus",
  ]);
});
