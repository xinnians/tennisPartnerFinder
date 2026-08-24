import assert from "node:assert/strict";
import test from "node:test";

import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

function installDom() {
  const window = new Window({ url: "http://localhost/" });
  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    requestAnimationFrame: (callback) => callback(),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  window.document.body.innerHTML =
    '<div id="react-root"></div><div id="sheet-root"><section id="player-card"></section></div>';

  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    window.close();
  };
}

test("Player Card resolves invite action codes before its generic fallback", async (t) => {
  const restoreDom = installDom();
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    root: new URL("../", import.meta.url).pathname,
    server: { middlewareMode: true },
  });

  const { SurfaceHost, installSurfaceHostRenderer } = await vite.ssrLoadModule("/src/app/SurfaceHost.tsx");
  const { SessionActionError } = await vite.ssrLoadModule("/src/data/dataErrors.ts");
  const { mountPlayerCardSheetContent } = await vite.ssrLoadModule("/src/sheets/PlayerCardSheet.tsx");
  const documentRoot = globalThis.document;
  const reactRoot = createRoot(documentRoot.querySelector("#react-root"));
  installSurfaceHostRenderer((slots) => reactRoot.render(createElement(SurfaceHost, { slots })));

  const sheetRoot = documentRoot.querySelector("#sheet-root");
  const surface = documentRoot.querySelector("#player-card");
  let content;
  await act(async () => {
    content = mountPlayerCardSheetContent(surface, {
      courts: [{ city: "台北市", district: "中山區", id: 8, name: "大佳河濱公園網球場" }],
      myInvitableSessions: [
        {
          court: "大佳河濱公園網球場",
          courtDistrict: "中山區",
          playType: "雙打",
          sessionId: 72,
          startAt: "2030-01-01T01:00:00.000Z",
        },
      ],
      onClose() {},
      onCreate() {},
      async onInvite() {
        throw new SessionActionError("ALREADY_INVITED");
      },
      onSeeDirectory() {},
      player: {
        courtName: "大佳河濱公園網球場",
        isSelf: false,
        nickname: "重複邀請球友",
        profileId: 91,
      },
      sheetRoot,
    });
  });
  t.after(async () => {
    await act(async () => {
      content.unmount();
      installSurfaceHostRenderer(() => {});
      reactRoot.unmount();
    });
    await vite.close();
    restoreDom();
  });

  const radio = surface.querySelector("input[name='player-invite-session']");
  const form = surface.querySelector("form");
  radio.checked = true;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(surface.querySelector("[role='alert']").textContent, "你已邀請過這位球友。");
  assert.equal(surface.querySelector("[role='alert']").hidden, false);
});
