import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CONFIG = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

function headerMap(rule) {
  return new Map(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

test("Vercel applies the current non-breaking security headers to every path", () => {
  assert.equal(CONFIG.$schema, "https://openapi.vercel.sh/vercel.json");
  const globalRule = CONFIG.headers.find(({ source }) => source === "/(.*)");
  assert.ok(globalRule, "global Vercel header rule is missing");
  const headers = headerMap(globalRule);

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("permissions-policy"), "geolocation=(self), camera=(), microphone=()");
  assert.equal(headers.has("content-security-policy"), false, "CSP must not enforce before preview violation triage");
});

test("report-only CSP covers the React build's current external resources without an endpoint", () => {
  const globalRule = CONFIG.headers.find(({ source }) => source === "/(.*)");
  const policy = headerMap(globalRule).get("content-security-policy-report-only");
  assert.ok(policy);

  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ]) {
    assert.ok(policy.includes(directive), `CSP directive missing: ${directive}`);
  }
  for (const origin of [
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://*.google.com",
    "https://*.googleusercontent.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ]) {
    assert.ok(policy.includes(origin), `CSP misses a current app resource: ${origin}`);
  }
  assert.doesNotMatch(policy, /report-uri|report-to/i, "no CSP reporting endpoint was approved");
});

test("the push service worker always revalidates instead of staying stale", () => {
  const workerRule = CONFIG.headers.find(({ source }) => source === "/push-sw.js");
  assert.ok(workerRule, "push service worker header rule is missing");
  assert.equal(headerMap(workerRule).get("cache-control"), "public, max-age=0, must-revalidate");
});
