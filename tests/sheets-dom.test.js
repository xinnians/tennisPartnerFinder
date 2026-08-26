import assert from "node:assert/strict";
import test from "node:test";

import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

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
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  globalThis.document.body.innerHTML = `
    <main id="app">
      <section id="page-content"></section>
      <section id="pre-isolated" inert></section>
      <div id="sheet-root"></div>
      <div id="modal-root"></div>
      <div id="toast-root"></div>
    </main>
    <div id="react-test-root"></div>`;

  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    window.close();
  };
}

async function loadSheets(t, vite) {
  const restoreDom = installDom();
  const sequence = ++sheetsModuleSequence;
  const host = await vite.ssrLoadModule(`/src/app/SurfaceHost.tsx?dom-test=${sequence}`);
  const reactRoot = createRoot(document.getElementById("react-test-root"));
  host.installSurfaceHostRenderer((slots) => reactRoot.render(createElement(host.SurfaceHost, { slots })));
  const url = new URL("../src/sheets.js", import.meta.url);
  url.searchParams.set("dom-test", String(sequence));
  const sheets = await import(url.href);
  sheets.configureSurfaceShellRenderer(host.mountSurfaceShell);
  t.after(async () => {
    await act(async () => {
      host.installSurfaceHostRenderer(() => {});
      reactRoot.unmount();
    });
    restoreDom();
  });
  return sheets;
}

function dispatchKey(key, options = {}) {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }));
}

function createViteHarness() {
  return createServer({
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    root: new URL("../", import.meta.url).pathname,
    server: { hmr: false, middlewareMode: true },
  });
}

domTest("關閉 sheet 時先卸載內容再清空殼", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  const mounted = mountSheet({ id: "測試-sheet", label: "測試", html: '<button type="button">關閉</button>' });
  let rootStillContainsSurface = false;
  mounted.registerUnmount(() => {
    rootStillContainsSurface = Boolean(mounted.root.querySelector(".surface"));
  });

  mounted.close();

  assert.equal(rootStillContainsSurface, true);
  assert.equal(mounted.root.innerHTML, "");
});

domTest("卸載內容拋錯時仍清空 sheet 殼", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  const mounted = mountSheet({ id: "錯誤-sheet", label: "測試", html: "<p>內容</p>" });
  mounted.registerUnmount(() => {
    throw new Error("React 卸載失敗");
  });

  assert.throws(() => mounted.close(), /React 卸載失敗/);
  assert.equal(mounted.root.innerHTML, "");
});

domTest("Escape 只關閉最上層 surface", async (t, vite) => {
  const { mountDialog, mountSheet } = await loadSheets(t, vite);
  const sheet = mountSheet({ id: "底層-sheet", label: "底層", html: "<button>底層</button>" });
  const dialog = mountDialog({ id: "上層-dialog", label: "上層", html: "<button>上層</button>" });

  dispatchKey("Escape");

  assert.equal(dialog.root.innerHTML, "");
  assert.notEqual(sheet.root.innerHTML, "");
  dispatchKey("Escape");
  assert.equal(sheet.root.innerHTML, "");
});

domTest("sheet 將 Tab 焦點限制在第一個與最後一個可互動控制項", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
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

domTest("關閉 sheet 依序還原新卡片、抽屜收合按鈕與 toggle 的焦點", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
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

domTest("React shell 與舊版 sheet、dialog 序列化 DOM byte-identical", async (t, vite) => {
  const { mountDialog, mountSheet } = await loadSheets(t, vite);
  const sheet = mountSheet({
    id: 'sheet<&"',
    label: '標籤<&"',
    className: "extra",
    onEscape() {},
    html: '<button type="button" data-surface-close>關閉 &amp; 繼續</button>',
  });

  assert.equal(
    sheet.root.innerHTML,
    '\n    <div class="surface-backdrop" data-surface-dismiss=""></div>\n    <section id="sheet<&amp;&quot;" data-testid="sheet<&amp;&quot;" class="surface surface--sheet extra" role="dialog" aria-modal="true" aria-label="標籤<&amp;&quot;" tabindex="-1">\n      <button type="button" data-surface-close="">關閉 &amp; 繼續</button>\n    </section>'
  );
  sheet.root.querySelector("[data-surface-close]").click();
  assert.equal(sheet.root.innerHTML, "");

  const dialog = mountDialog({
    id: "empty-dialog",
    label: "空白對話框",
    className: "auth-dialog",
    onEscape() {},
    html: "",
  });
  assert.equal(
    dialog.root.innerHTML,
    '\n    <div class="surface-backdrop" data-surface-dismiss=""></div>\n    <section id="empty-dialog" data-testid="empty-dialog" class="surface surface--dialog auth-dialog" role="dialog" aria-modal="true" aria-label="空白對話框" tabindex="-1">\n      \n    </section>'
  );
  dialog.close({ restoreFocus: false });
});

function isolationAttributes() {
  return ["page-content", "pre-isolated", "sheet-root", "modal-root", "toast-root"].map((id) => [
    id,
    document.getElementById(id).getAttribute("inert"),
  ]);
}

test("surface isolation 在關閉與替換後 acquire/release 平衡", async (t) => {
  const vite = await createViteHarness();
  t.after(() => vite.close());
  await act(async () => {
    const { mountSheet } = await loadSheets(t, vite);
    const baseline = isolationAttributes();
    const first = mountSheet({ id: "first-sheet", label: "第一張", html: "<p>第一張</p>" });
    assert.equal(document.getElementById("page-content").hasAttribute("inert"), true);
    assert.equal(document.getElementById("modal-root").hasAttribute("inert"), true);
    assert.equal(document.getElementById("toast-root").hasAttribute("inert"), false);
    first.close({ restoreFocus: false });
    assert.deepEqual(isolationAttributes(), baseline);

    const replaced = mountSheet({ id: "replaced-sheet", label: "被替換", html: "<p>舊</p>" });
    const replacement = mountSheet({ id: "replacement-sheet", label: "替換後", html: "<p>新</p>" });
    assert.equal(replaced.root.querySelector(".surface"), replacement.surface);
    assert.equal(document.getElementById("page-content").hasAttribute("inert"), true);
    assert.equal(document.getElementById("modal-root").hasAttribute("inert"), true);
    replacement.close({ restoreFocus: false });
    assert.deepEqual(isolationAttributes(), baseline);
  });
});

test("sheets DOM 殼契約", async (t) => {
  const vite = await createViteHarness();
  t.after(() => vite.close());
  for (const { name, fn } of domCases) {
    await t.test(name, async (subtest) => {
      await act(async () => fn(subtest, vite));
    });
  }
});
