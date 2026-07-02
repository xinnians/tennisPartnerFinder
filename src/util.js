// ============================================================
//  小工具
// ============================================================

/** HTML escape(信任的假資料仍一律 escape,養成好習慣) */
export function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

/** 只放 http(s) 連結進 href,擋掉 javascript: 之類的 scheme */
export function safeUrl(url) {
  return /^https?:\/\//i.test(url) ? url : "#";
}

/** 從需求貼文網址推來源名稱(設計檔在「查看原貼文」旁顯示來源) */
export function sourceLabel(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("ptt.cc")) return "PTT Tennis 板";
    if (host.includes("facebook.com")) return "FB 社團";
    if (host.includes("dcard")) return "Dcard";
    if (host.includes("line.me")) return "LINE 社群";
    return host.replace(/^www\./, "");
  } catch {
    return "原貼文";
  }
}

/** NTRP 數字 → 程度分級文案(設計檔 ntrpDesc) */
export function ntrpDesc(n) {
  if (n <= 2.5) return "初階";
  if (n <= 3.5) return "中階";
  if (n <= 4.5) return "中高階";
  return "高手";
}
