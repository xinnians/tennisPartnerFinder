import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("MessagesPage 輸出訊息標題、可開啟的球局列與未讀提示", async (t) => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    root: new URL("../", import.meta.url).pathname,
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const { MessagesPage } = await vite.ssrLoadModule("/src/pages/MessagesPage.tsx");

  const html = renderToStaticMarkup(
    createElement(MessagesPage, {
      courts: [{ id: 1, name: "大安運動中心" }],
      groups: {
        upcoming: [
          {
            court: "大安運動中心",
            courtDistrict: "大安區",
            hostNickname: "小安",
            sessionId: 42,
            startAt: "2026-08-25T10:00:00+08:00",
            status: "open",
            unreadMessageCount: 2,
            viewerParticipantStatus: "accepted",
            viewerRole: "guest",
          },
        ],
      },
      onOpenChat: () => {},
    })
  );

  assert.match(html, /<h1[^>]*>訊息<\/h1>/);
  assert.match(html, /data-testid="messages-row-42"/);
  assert.match(html, />大安運動中心</);
  // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  assert.match(html, /aria-label="大安運動中心，[^\"]*，2 則未讀訊息"/);
});
