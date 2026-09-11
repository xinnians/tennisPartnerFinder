import type { SurfaceCloseOptions } from "../../domainTypes.ts";

type CloseChat = (options: SurfaceCloseOptions) => void;
interface ChatEntry {
  token: string;
  url: string;
  close: CloseChat;
}

const KEY = "qiukaChatEntry";

/** 同網址的暫時歷史紀錄，讓系統返回先關閉聊天室，再離開原頁面。 */
export function createChatHistory(
  browser: Pick<Window, "history" | "location" | "addEventListener" | "removeEventListener">
) {
  let active: ChatEntry | null = null;
  let pendingBack = false;
  let listening = false;
  let sequence = 0;
  const identity = `${Date.now()}-${Math.random()}`;
  const state = (): Record<string, unknown> => {
    const value: unknown = browser.history.state;
    return value && typeof value === "object" ? { ...value } : {};
  };
  const cleanState = () => {
    const next = state();
    delete next[KEY];
    return next;
  };
  function stopWhenIdle() {
    if (active || pendingBack || !listening) return;
    browser.removeEventListener("popstate", onPopState);
    listening = false;
  }
  function writeEntry(entry: ChatEntry) {
    const method = state()[KEY] ? "replaceState" : "pushState";
    browser.history[method]({ ...cleanState(), [KEY]: entry.token }, "", entry.url);
  }
  function onPopState() {
    if (pendingBack) {
      pendingBack = false;
      // 使用者可能在 history.back() 事件到達前，立即重新開啟聊天室。
      if (active && browser.location.href === active.url) writeEntry(active);
      else if (active) active.close({ reason: "history-back", restoreFocus: false });
      stopWhenIdle();
      return;
    }
    if (active && state()[KEY] !== active.token) {
      active.close({ reason: "history-back", restoreFocus: browser.location.href === active.url });
    }
    stopWhenIdle();
  }
  return function bindChatHistory(close: CloseChat): (options?: SurfaceCloseOptions) => void {
    const entry = { token: `${identity}-${++sequence}`, url: browser.location.href, close };
    active = entry;
    if (!listening) {
      browser.addEventListener("popstate", onPopState);
      listening = true;
    }
    if (!pendingBack) writeEntry(entry);
    return ({ reason = "dismiss" } = {}) => {
      if (active !== entry) return;
      active = null;
      if (state()[KEY] === entry.token) {
        if (reason === "dismiss") {
          pendingBack = true;
          browser.history.back();
        } else {
          // 生命週期替換或登出不可非同步返回，避免蓋過新頁面
          // 或從歷史紀錄恢復私人聊天室。
          browser.history.replaceState(cleanState(), "", browser.location.href);
        }
      }
      stopWhenIdle();
    };
  };
}
