import assert from "node:assert/strict";
import test from "node:test";

import { sessionIdFromHash } from "../src/sessionRoute.js";

test("session hash route accepts only a positive safe integer id", () => {
  assert.equal(sessionIdFromHash("#/session/42"), 42);
  assert.equal(sessionIdFromHash("#/session/9001"), 9001);
});

test("session hash route rejects malformed, unsafe, and unrelated hashes", () => {
  for (const hash of ["", "#/session/", "#/session/0", "#/session/-1", "#/session/01", "#/session/1/extra", "#/sessions/1", "#/session/9007199254740992"]) {
    assert.equal(sessionIdFromHash(hash), null, hash);
  }
});
