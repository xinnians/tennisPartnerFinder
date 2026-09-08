import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
const source = readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8");
function fixture(clients = []) {
  const listeners = {};
  const shown = [];
  const opened = [];
  vm.runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://qiuka.tw" },
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      },
      registration: {
        showNotification: async (title, options) => {
          shown.push({ title, ...options });
        },
      },
      clients: {
        matchAll: async () => clients,
        openWindow: async (url) => {
          opened.push(url);
        },
      },
    },
  });
  const run = async (name, event) => {
    let work;
    listeners[name]({
      ...event,
      waitUntil: (promise) => {
        work = promise;
      },
    });
    await work;
  };
  return { run, shown, opened };
}
test("v2 notifications use stable delivery tags and expose only the same-origin deep link", async () => {
  const f = fixture();
  const id = "11111111-1111-4111-8111-111111111111";
  await f.run("push", { data: { json: () => ({ notificationId: id, message: "摘要", url: "#session=123" }) } });
  assert.equal(f.shown[0].tag, id);
  assert.equal(f.shown[0].data.url, "https://qiuka.tw/#session=123");
  assert.deepEqual(Object.keys(f.shown[0].data), ["url"]);
});
test("malformed push data still displays a notification without breaking the worker", async () => {
  const f = fixture();
  await f.run("push", {
    data: {
      json: () => {
        throw new Error("invalid JSON");
      },
    },
  });
  assert.equal(f.shown[0].title, "球咖通知");
});
test("clicking a notification navigates and focuses an existing app window", async () => {
  const calls = [];
  const app = {
    url: "https://qiuka.tw/",
    navigate: async (url) => {
      calls.push(url);
      return { focus: async () => calls.push("focus") };
    },
  };
  const f = fixture([app]);
  await f.run("notificationclick", { notification: { close() {}, data: { url: "#session=123" } } });
  assert.deepEqual(calls, ["https://qiuka.tw/#session=123", "focus"]);
  assert.deepEqual(f.opened, []);
});
test("cross-origin and malformed click targets fall back to the app", async () => {
  for (const url of ["https://evil.example/", "javascript:alert(1)", "https://["]) {
    const f = fixture();
    await f.run("notificationclick", { notification: { close() {}, data: { url } } });
    assert.deepEqual(f.opened, ["https://qiuka.tw/#/"]);
  }
});
