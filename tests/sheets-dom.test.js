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
  const renderSurfaceHost = (slots) => reactRoot.render(createElement(host.SurfaceHost, { slots }));
  host.installSurfaceHostRenderer(renderSurfaceHost);
  const url = new URL("../src/sheets.js", import.meta.url);
  url.searchParams.set("dom-test", String(sequence));
  const sheets = await import(url.href);
  sheets.configureSurfaceShellRenderer(host.mountSurfaceShell);
  sheets.configureSurfaceKeyboardRegistry(host.surfaceKeyboardRegistry);
  sheets.configureSurfaceFocusRegistry(host.surfaceFocusRegistry);
  t.after(async () => {
    await act(async () => {
      host.installSurfaceHostRenderer(() => {});
      reactRoot.unmount();
    });
    restoreDom();
  });
  return { ...sheets, __surfaceHost: host };
}

function dispatchKey(key, options = {}, target = document) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options });
  target.dispatchEvent(event);
  return event;
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
  try {
    dispatchKey("Escape");

    assert.equal(dialog.root.innerHTML, "");
    assert.notEqual(sheet.root.innerHTML, "");
    dispatchKey("Escape");
    assert.equal(sheet.root.innerHTML, "");
  } finally {
    dialog.close({ restoreFocus: false });
    sheet.close({ restoreFocus: false });
  }
});

domTest("onEscape 同步短路後保留 topmost surface", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  let escapeCalls = 0;
  const mounted = mountSheet({
    id: "escape-short-circuit-sheet",
    label: "Escape 短路",
    html: "<button>保留</button>",
    onEscape() {
      escapeCalls += 1;
      return true;
    },
  });

  const event = dispatchKey("Escape");

  assert.equal(escapeCalls, 1);
  assert.equal(event.defaultPrevented, true);
  assert.notEqual(mounted.root.innerHTML, "");
  mounted.close({ restoreFocus: false });
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

  let forwardTarget;
  let backwardTarget;
  try {
    last.focus();
    dispatchKey("Tab");
    forwardTarget = document.activeElement;
    first.focus();
    dispatchKey("Tab", { shiftKey: true });
    backwardTarget = document.activeElement;
  } finally {
    mounted.close({ restoreFocus: false });
  }
  assert.equal(forwardTarget, first);
  assert.equal(backwardTarget, last);
});

domTest("Tab trap 排除自身與祖先帶 hidden 的控制項", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  const mounted = mountSheet({
    id: "hidden-focus-sheet",
    label: "hidden focus",
    html: `
      <button id="visible-first">第一個</button>
      <button id="visible-last">最後一個</button>
      <button id="direct-hidden" hidden>直接隱藏</button>
      <div hidden><button id="nested-hidden">祖先隱藏</button></div>`,
  });
  const first = mounted.surface.querySelector("#visible-first");
  const last = mounted.surface.querySelector("#visible-last");

  let forwardTarget;
  let backwardTarget;
  try {
    last.focus();
    dispatchKey("Tab");
    forwardTarget = document.activeElement;
    first.focus();
    dispatchKey("Tab", { shiftKey: true });
    backwardTarget = document.activeElement;
  } finally {
    mounted.close({ restoreFocus: false });
  }
  assert.equal(forwardTarget, first);
  assert.equal(backwardTarget, last);
});

domTest("零 focusable 時 Tab 由 surface 接住", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  const mounted = mountSheet({ id: "empty-focus-sheet", label: "空焦點", html: "<p>沒有控制項</p>" });

  const event = dispatchKey("Tab");

  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, mounted.surface);
  mounted.close({ restoreFocus: false });
});

domTest("首幀聚焦不覆寫 onMount 內的主動焦點", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  let intentionalTarget;
  const mounted = mountSheet({
    id: "intentional-focus-sheet",
    label: "主動焦點",
    html: '<button id="automatic-target">預設第一個</button><button id="intentional-target">主動目標</button>',
    onMount({ surface }) {
      intentionalTarget = surface.querySelector("#intentional-target");
      intentionalTarget.focus();
    },
  });

  const focusedAfterMount = document.activeElement;
  mounted.close({ restoreFocus: false });

  assert.equal(focusedAfterMount === intentionalTarget, true);
});

domTest("surface Escape 阻斷 bubble，全部關閉後不再 consume", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  let bubbled = 0;
  const probe = () => {
    bubbled += 1;
  };
  document.addEventListener("keydown", probe);
  try {
    const mounted = mountSheet({ id: "bubble-sheet", label: "bubble", html: "<button>關閉</button>" });
    const consumed = dispatchKey("Escape", {}, mounted.surface);
    assert.equal(consumed.defaultPrevented, true);
    assert.equal(bubbled, 0);

    const afterClose = dispatchKey("Escape", {}, document.body);
    assert.equal(afterClose.defaultPrevented, false);
    assert.equal(bubbled, 1);
  } finally {
    document.removeEventListener("keydown", probe);
  }
});

domTest("replace 後單一 keydown listener 安裝與移除保持平衡", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  const addEventListener = document.addEventListener;
  const removeEventListener = document.removeEventListener;
  let captureAdds = 0;
  let captureRemoves = 0;
  document.addEventListener = function trackedAdd(type, listener, options) {
    if (type === "keydown" && options === true) captureAdds += 1;
    return addEventListener.call(this, type, listener, options);
  };
  document.removeEventListener = function trackedRemove(type, listener, options) {
    if (type === "keydown" && options === true) captureRemoves += 1;
    return removeEventListener.call(this, type, listener, options);
  };
  try {
    mountSheet({ id: "before-replace-sheet", label: "替換前", html: "<button>舊</button>" });
    const replacement = mountSheet({ id: "after-replace-sheet", label: "替換後", html: "<button>新</button>" });
    replacement.close({ restoreFocus: false });

    assert.equal(captureAdds, 2);
    assert.equal(captureRemoves, 2);
    assert.equal(dispatchKey("Escape", {}, document.body).defaultPrevented, false);
  } finally {
    document.addEventListener = addEventListener;
    document.removeEventListener = removeEventListener;
  }
});

domTest("shell 與 content 同時卸載失敗仍完成 close cleanup", async (t, vite) => {
  const { __surfaceHost, configureSurfaceShellRenderer, mountSheet } = await loadSheets(t, vite);
  configureSurfaceShellRenderer((root, options) => {
    const shell = __surfaceHost.mountSurfaceShell(root, options);
    return {
      surface: shell.surface,
      unmount() {
        shell.unmount();
        throw new Error("shell unmount failed");
      },
    };
  });
  const opener = document.createElement("button");
  opener.textContent = "開啟者";
  document.getElementById("page-content").append(opener);
  opener.focus();
  let closeCalls = 0;
  const mounted = mountSheet({
    id: "shell-error-sheet",
    label: "卸載錯誤",
    html: "<p>內容</p>",
    onClose() {
      closeCalls += 1;
    },
  });
  mounted.registerUnmount(() => {
    throw new Error("content unmount failed");
  });

  assert.throws(
    () => mounted.close(),
    (error) =>
      error instanceof AggregateError &&
      error.errors.map((entry) => entry.message).join("|") === "content unmount failed|shell unmount failed"
  );
  assert.equal(closeCalls, 1);
  assert.equal(document.activeElement, opener);

  configureSurfaceShellRenderer(__surfaceHost.mountSurfaceShell);
  const replacement = mountSheet({ id: "after-error-sheet", label: "錯誤後", html: "<p>新殼</p>" });
  assert.equal(replacement.surface.id, "after-error-sheet");
  replacement.close({ restoreFocus: false });
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
  const replacementTarget = document.activeElement;

  replacement.focus();
  const second = mountSheet({ id: "fallback-sheet", label: "fallback", html: "<button>關閉</button>" });
  replacement.remove();
  const collapse = document.createElement("button");
  collapse.dataset.testid = "drawer-collapse";
  collapse.textContent = "收合";
  drawer.append(collapse);

  second.close();
  const collapseTarget = document.activeElement;

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
  const toggleTarget = document.activeElement;

  assert.equal(replacementTarget === replacement, true);
  assert.equal(collapseTarget === collapse, true);
  assert.equal(toggleTarget === toggle, true);
});

domTest("非抽屜 restore target 消失後不回退到 drawer 控制項", async (t, vite) => {
  const { mountSheet } = await loadSheets(t, vite);
  const drawer = document.createElement("section");
  drawer.id = "nearby-sessions-drawer";
  const collapse = document.createElement("button");
  collapse.dataset.testid = "drawer-collapse";
  collapse.textContent = "收合";
  const toggle = document.createElement("button");
  toggle.id = "nearby-sessions-toggle";
  toggle.textContent = "展開或收合附近球局";
  drawer.append(collapse, toggle);
  document.getElementById("app").append(drawer);

  const opener = document.createElement("button");
  opener.dataset.sessionId = "outside-drawer";
  opener.textContent = "非抽屜卡片";
  document.getElementById("page-content").append(opener);
  opener.focus();
  const mounted = mountSheet({ id: "non-drawer-sheet", label: "非抽屜", html: "<button>關閉</button>" });
  opener.remove();

  mounted.close();

  assert.equal(document.activeElement === collapse, false);
  assert.equal(document.activeElement === toggle, false);
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
