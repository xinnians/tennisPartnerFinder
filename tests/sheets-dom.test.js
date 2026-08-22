import assert from "node:assert/strict";
import test from "node:test";

import { Window } from "happy-dom";

let sheetsModuleSequence = 0;
const domCases = [];
const domTest = (name, fn) => domCases.push({ name, fn });

function installDom() {
  const window = new Window({ url: "http://localhost/" });
  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    requestAnimationFrame: (callback) => callback(),
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  globalThis.document.body.innerHTML = '<main id="app"></main><div id="sheet-root"></div><div id="modal-root"></div>';

  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    window.close();
  };
}

async function loadSheets() {
  const url = new URL("../src/sheets.js", import.meta.url);
  url.searchParams.set("dom-test", String(++sheetsModuleSequence));
  return import(url.href);
}

function dispatchKey(key, options = {}) {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }));
}

domTest("關閉 sheet 時先卸載內容再清空殼", async (t) => {
  const restoreDom = installDom();
  t.after(restoreDom);
  const { mountSheet } = await loadSheets();
  const mounted = mountSheet({ id: "測試-sheet", label: "測試", html: '<button type="button">關閉</button>' });
  let rootStillContainsSurface = false;
  mounted.registerUnmount(() => {
    rootStillContainsSurface = Boolean(mounted.root.querySelector(".surface"));
  });

  mounted.close();

  assert.equal(rootStillContainsSurface, true);
  assert.equal(mounted.root.innerHTML, "");
});

domTest("卸載內容拋錯時仍清空 sheet 殼", async (t) => {
  const restoreDom = installDom();
  t.after(restoreDom);
  const { mountSheet } = await loadSheets();
  const mounted = mountSheet({ id: "錯誤-sheet", label: "測試", html: "<p>內容</p>" });
  mounted.registerUnmount(() => {
    throw new Error("React 卸載失敗");
  });

  assert.throws(() => mounted.close(), /React 卸載失敗/);
  assert.equal(mounted.root.innerHTML, "");
});

domTest("Escape 只關閉最上層 surface", async (t) => {
  const restoreDom = installDom();
  t.after(restoreDom);
  const { mountDialog, mountSheet } = await loadSheets();
  const sheet = mountSheet({ id: "底層-sheet", label: "底層", html: "<button>底層</button>" });
  const dialog = mountDialog({ id: "上層-dialog", label: "上層", html: "<button>上層</button>" });

  dispatchKey("Escape");

  assert.equal(dialog.root.innerHTML, "");
  assert.notEqual(sheet.root.innerHTML, "");
  dispatchKey("Escape");
  assert.equal(sheet.root.innerHTML, "");
});

domTest("sheet 將 Tab 焦點限制在第一個與最後一個可互動控制項", async (t) => {
  const restoreDom = installDom();
  t.after(restoreDom);
  const { mountSheet } = await loadSheets();
  const mounted = mountSheet({
    id: "焦點-sheet",
    label: "焦點",
    html: '<button id="first" type="button">第一個</button><button id="last" type="button">最後一個</button>',
  });
  const first = mounted.surface.querySelector("#first");
  const last = mounted.surface.querySelector("#last");

  last.focus();
  dispatchKey("Tab");
  assert.equal(document.activeElement, first);
  first.focus();
  dispatchKey("Tab", { shiftKey: true });
  assert.equal(document.activeElement, last);
  mounted.close();
});

domTest("關閉 sheet 依序還原新卡片、抽屜收合按鈕與 toggle 的焦點", async (t) => {
  const restoreDom = installDom();
  t.after(restoreDom);
  const { mountSheet } = await loadSheets();
  const drawer = document.createElement("section");
  drawer.id = "nearby-sessions-drawer";
  drawer.innerHTML = '<button data-session-id="42" type="button">原卡片</button>';
  document.getElementById("app").append(drawer);
  const opener = drawer.querySelector("[data-session-id]");
  opener.focus();
  const first = mountSheet({ id: "卡片-sheet", label: "卡片", html: "<button>關閉</button>" });
  opener.remove();
  const replacement = document.createElement("button");
  replacement.dataset.sessionId = "42";
  replacement.textContent = "重繪後卡片";
  drawer.append(replacement);

  first.close();
  assert.equal(document.activeElement, replacement);

  replacement.focus();
  const second = mountSheet({ id: "fallback-sheet", label: "fallback", html: "<button>關閉</button>" });
  replacement.remove();
  const collapse = document.createElement("button");
  collapse.dataset.testid = "drawer-collapse";
  collapse.textContent = "收合";
  drawer.append(collapse);

  second.close();
  assert.equal(document.activeElement, collapse);

  collapse.remove();
  const toggleOpener = document.createElement("button");
  toggleOpener.dataset.sessionId = "99";
  toggleOpener.textContent = "第二張原卡片";
  drawer.append(toggleOpener);
  toggleOpener.focus();
  const third = mountSheet({ id: "toggle-fallback-sheet", label: "toggle fallback", html: "<button>關閉</button>" });
  toggleOpener.remove();
  assert.equal(drawer.querySelector('[data-testid="drawer-collapse"]'), null);
  const toggle = document.createElement("button");
  toggle.id = "nearby-sessions-toggle";
  toggle.textContent = "展開或收合附近球局";
  drawer.append(toggle);

  third.close();
  assert.equal(document.activeElement, toggle);
});

test("sheets DOM 殼契約", async (t) => {
  for (const { name, fn } of domCases) {
    await t.test(name, fn);
  }
});
