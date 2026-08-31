import { expect, test } from "@playwright/test";

const SDK_HARNESS_PATH = "/tests/fixtures/authLockBrowserHarness.js";

async function callSdkHarness(page, method) {
  return page.evaluate(
    async ({ harnessPath, methodName }) => {
      const harness = await import(harnessPath);
      return harness[methodName]();
    },
    { harnessPath: SDK_HARNESS_PATH, methodName: method }
  );
}

test("auth storage lock serializes same-origin tabs without stealing an in-flight lock", async ({ context, page }) => {
  const peer = await context.newPage();
  await Promise.all([page.goto("/"), peer.goto("/")]);
  const lockName = `auth-lock-browser-${Date.now()}`;

  await page.evaluate(async (name) => {
    const { serializeSupabaseAuthStorage } = await import("/src/supabaseClient.js");
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    window.__authLockTest = { release, state: "starting" };
    window.__authLockTest.promise = serializeSupabaseAuthStorage(name, -1, async () => {
      window.__authLockTest.state = "held";
      await gate;
      window.__authLockTest.state = "releasing";
    }).then(() => {
      window.__authLockTest.state = "done";
    });
  }, lockName);
  await expect.poll(() => page.evaluate(() => window.__authLockTest.state)).toBe("held");

  await peer.evaluate(async (name) => {
    const { serializeSupabaseAuthStorage } = await import("/src/supabaseClient.js");
    window.__authLockTest = { state: "waiting" };
    window.__authLockTest.promise = serializeSupabaseAuthStorage(name, -1, async () => {
      window.__authLockTest.state = "held";
    }).then(() => {
      window.__authLockTest.state = "done";
    });
  }, lockName);
  await peer.waitForTimeout(100);
  expect(await peer.evaluate(() => window.__authLockTest.state)).toBe("waiting");

  await page.evaluate(() => window.__authLockTest.release());
  await expect.poll(() => peer.evaluate(() => window.__authLockTest.state)).toBe("done");
  expect(await page.evaluate(() => window.__authLockTest.state)).toBe("done");
});

test("the real auth client cannot overwrite a newer account in another tab", async ({ context, page }) => {
  const peer = await context.newPage();
  await Promise.all([page.goto("/"), peer.goto("/")]);
  await callSdkHarness(page, "seedAccountA");

  await callSdkHarness(page, "startHeldRefresh");
  await expect.poll(() => callSdkHarness(page, "operationState")).toBe("held");

  await callSdkHarness(peer, "startAccountSwitch");
  await peer.waitForTimeout(100);
  expect(await callSdkHarness(peer, "operationState")).toBe("waiting");
  expect(await callSdkHarness(peer, "storedIdentity")).toBe("account-a");

  await callSdkHarness(page, "releaseHeldRefresh");
  await expect.poll(() => callSdkHarness(page, "operationState")).toBe("done");
  await expect.poll(() => callSdkHarness(peer, "operationState")).toBe("done");
  expect(await callSdkHarness(peer, "storedIdentity")).toBe("account-b");
});

test("the real auth client cannot resurrect a session after another tab signs out", async ({ context, page }) => {
  const peer = await context.newPage();
  await Promise.all([page.goto("/"), peer.goto("/")]);
  await callSdkHarness(page, "seedAccountA");

  await callSdkHarness(page, "startHeldRefresh");
  await expect.poll(() => callSdkHarness(page, "operationState")).toBe("held");

  await callSdkHarness(peer, "startLocalSignOut");
  await peer.waitForTimeout(100);
  expect(await callSdkHarness(peer, "operationState")).toBe("waiting");
  expect(await callSdkHarness(peer, "storedIdentity")).toBe("account-a");

  await callSdkHarness(page, "releaseHeldRefresh");
  await expect.poll(() => callSdkHarness(page, "operationState")).toBe("done");
  await expect.poll(() => callSdkHarness(peer, "operationState")).toBe("done");
  expect(await callSdkHarness(peer, "storedIdentity")).toBeNull();
});
