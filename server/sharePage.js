// Server-only anonymous share surface. Never forward browser credentials or read private tables.
export const SHARE_SELECT =
  "session_id,court,start_at,play_type,ntrp_min,ntrp_max,slots_remaining,status,venue_type,range_end,decided_at";

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

export function shareId(url) {
  const path = /^\/s\/([1-9]\d*)\/?$/.exec(url.pathname);
  const ids = url.searchParams.getAll("id");
  const value = path
    ? ids.length
      ? null
      : path[1]
    : url.pathname === "/api/share" && ids.length === 1
      ? ids[0]
      : null;
  return value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

function visibleRow(row, id, now) {
  if (!row || Number(row.session_id) !== id || !["open", "full"].includes(row.status)) return false;
  const start = Date.parse(row.start_at);
  return (
    Number.isFinite(start) &&
    (row.venue_type === "candidates" && !row.decided_at ? start > now : start + 7_200_000 > now)
  );
}

function summary(row) {
  const start = new Date(row.start_at);
  const day = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(start);
  const clock = (date) =>
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(date));
  const candidate = row.venue_type === "candidates" && !row.decided_at;
  const court = candidate ? "候選球場未定案" : row.court || "球場待確認";
  const time =
    candidate && Number.isFinite(Date.parse(row.range_end)) ? `${clock(start)}～${clock(row.range_end)}` : clock(start);
  const level =
    row.ntrp_min != null && row.ntrp_max != null
      ? `NTRP ${Number(row.ntrp_min).toFixed(1)}–${Number(row.ntrp_max).toFixed(1)}`
      : "程度不限";
  const capacity =
    row.status === "full" || Number(row.slots_remaining) <= 0 ? "已額滿" : `缺 ${Number(row.slots_remaining)} 位`;
  const venue = candidate
    ? "場地尚未定案"
    : row.venue_type === "booked"
      ? "已訂場"
      : row.venue_type === "candidates"
        ? "已定案，訂場待確認"
        : "現場等場";
  return {
    title: `${day} ${time}｜${court}｜${row.play_type} · 球咖`,
    description: `${level} · ${capacity} · ${venue}。最新名額與場地以球局詳情為準。（台北時間）`,
  };
}

function render(template, id, origin, content, production) {
  const canonical = `${origin}/s/${id}`;
  const head = `<title>${escapeHtml(content.title)}</title>
<meta name="description" content="${escapeHtml(content.description)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(content.title)}">
<meta property="og:description" content="${escapeHtml(content.description)}">
<meta property="og:type" content="website"><meta property="og:locale" content="zh_TW">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(origin)}/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="球咖｜台北網球">`;
  const clean = template
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:property=["']og:[^"']*["']|name=["'](?:description|robots)["'])[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  const notice = `<section id="share-page-fallback" style="padding:24px;font:16px sans-serif"><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.description)}</p><a href="/#/session/${id}">查看球局詳情</a> · <a href="/">找其他球局</a></section>`;
  // The early module normalizes the route for the unchanged app router before main.js boot.
  return clean
    .replace("</head>", `${head}${production ? "" : '<meta name="googlebot" content="noindex">'}</head>`)
    .replace(/<body([^>]*)>/i, `<body$1>${notice}`);
}

export async function handleSharePage(request, { template, env, fetchImpl = fetch, now = () => Date.now() }) {
  const url = new URL(request.url);
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, follow",
    "X-Content-Type-Options": "nosniff",
  };
  const respond = (body, status, extra = {}) =>
    new Response(request.method === "HEAD" ? null : body, { status, headers: { ...headers, ...extra } });
  if (!["GET", "HEAD"].includes(request.method)) return respond("Method not allowed", 405, { Allow: "GET, HEAD" });
  const id = shareId(url);
  if (!id) return respond("找不到這個球局連結。", 404);
  const origin =
    env.VERCEL_ENV === "production"
      ? "https://qiuka.tw"
      : env.VERCEL_URL
        ? `https://${env.VERCEL_URL}`
        : "http://127.0.0.1:4174";
  let status = 200;
  let content;
  try {
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new Error("Unavailable");
    const apiUrl = new URL("/rest/v1/session_discovery", env.VITE_SUPABASE_URL);
    apiUrl.search = new URLSearchParams({ select: SHARE_SELECT, session_id: `eq.${id}`, limit: "1" }).toString();
    const response = await fetchImpl(apiUrl, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Unavailable");
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("Invalid response");
    if (!visibleRow(rows[0], id, now())) {
      status = 404;
      content = { title: "目前無法查看這個球局｜球咖", description: "這個球局目前未公開，請回到地圖找其他球局。" };
    } else content = summary(rows[0]);
  } catch {
    status = 503;
    content = { title: "球局暫時無法載入｜球咖", description: "請稍後再試，或開啟球局詳情重新查看。" };
  }
  return respond(render(template, id, origin, content, env.VERCEL_ENV === "production"), status);
}
