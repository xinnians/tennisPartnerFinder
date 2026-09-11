import { accessSync } from "node:fs";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";
import { escapeHtml, loadPublicShareRow, shareId } from "./sharePage.js";

const fontFiles = ["Regular", "Bold"].map((weight) =>
  fileURLToPath(new URL(`./fonts/NotoSerifCJKtc-${weight}.otf`, import.meta.url))
);
const family = "Noto Serif CJK TC";
// Strip XML-invalid controls before escaping text.
// eslint-disable-next-line no-control-regex
const cleanText = (value) => String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");

// Conservative width budget includes Latin letters and punctuation, with a two-line ceiling.
function courtLines(value) {
  const chars = Array.from(cleanText(value));
  const size = chars.length <= 8 ? 80 : chars.length <= 12 ? 58 : 44;
  const limit = Math.floor(700 / size);
  return {
    size,
    lines:
      chars.length <= limit
        ? [chars.join("")]
        : [
            chars.slice(0, limit).join(""),
            chars.length > limit * 2 ? `${chars.slice(limit, limit * 2 - 1).join("")}…` : chars.slice(limit).join(""),
          ],
  };
}

export function shareCardContent(row) {
  if (!row)
    return {
      date: "球局資訊",
      time: "目前無法查看",
      court: "請回球咖尋找其他球局",
      detail: "最新資訊請開啟球局連結",
      venue: "",
      year: "",
    };
  const start = new Date(row.start_at);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(start);
  const part = (type) => parts.find((item) => item.type === type).value;
  const clock = (date) =>
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(date));
  const weekday = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    weekday: "short",
  }).format(start);
  const candidate = row.venue_type === "candidates" && !row.decided_at;
  const range = candidate && Number.isFinite(Date.parse(row.range_end)) ? `–${clock(row.range_end)}` : "";
  const level =
    row.ntrp_min != null && row.ntrp_max != null
      ? `NTRP ${Number(row.ntrp_min).toFixed(1)}–${Number(row.ntrp_max).toFixed(1)}`
      : "程度不限";
  const full = row.status === "full" || Number(row.slots_remaining) <= 0;
  return {
    date: `${part("month")}.${part("day")}`,
    time: `${weekday} ${clock(start)}${range}`,
    year: `${part("year")} · 台北時間`,
    court: candidate ? "候選球場未定案" : row.court || "球場待確認",
    detail: `${row.play_type}\u3000｜\u3000${level}`,
    venue: `${full ? "已額滿 · " : ""}${candidate ? "場地尚未定案" : row.venue_type === "booked" ? "已訂場" : row.venue_type === "candidates" ? "已定案，訂場待確認" : "現場等場"}`,
  };
}

/** Deterministic server artwork: no external resources, user markup, avatars or private text. */
export function renderShareCardSvg(content) {
  const text = (x, y, size, value, extra = "") =>
    `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escapeHtml(cleanText(value))}</text>`;
  const court = courtLines(content.court);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <filter id="paper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="3" seed="7" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="#062814"/>
  <rect width="1200" height="630" filter="url(#paper)" opacity=".17"/>
  <g fill="none" stroke="#eee9d4" stroke-width="3.4">
    <path d="M968 0 666 630 M917 107 1200 216 M1200 216 1038 544 M758 438 1200 609"/>
  </g>
  <circle cx="1062" cy="302" r="14" fill="#cde474"/>
  <path d="M1054 291 Q1062 302 1054 313 M1070 291 Q1062 302 1070 313" fill="none" stroke="#f0f2c3" stroke-width="1.1"/>
  <g stroke="#d6e965" fill="none" stroke-width="2.8">
    <circle cx="66" cy="64" r="23"/><path d="M51 46 Q70 64 51 82 M81 46 Q62 64 81 82"/>
  </g>
  <g fill="#f5efdc" font-family="${family}">
    ${text(112, 79, 36, "球 咖", 'font-weight="700"')}
    ${text(1155, 70, 23, "球局資訊", 'text-anchor="end"')}
    ${text(37, 276, /^\d/.test(content.date) ? 164 : 96, content.date, 'font-weight="700"')}
    ${text(42, 367, content.time.length > 12 ? 55 : 86, content.time, 'font-weight="700"')}
    ${court.lines.map((line, i) => text(42, (court.lines.length > 1 ? 440 : 479) + i * 54, court.size, line, 'font-weight="700"')).join("")}
    <path d="M42 532 H655" stroke="#c2c7ad" stroke-width="1"/>
    ${text(42, 581, 33, content.detail, 'letter-spacing="1"')}
    ${text(42, 613, 18, content.venue.replace(/(?: · )?已訂場$/, ""), 'fill="#ccd5bf"')}
  </g></svg>`;
}

export function renderShareCardPng(content) {
  fontFiles.forEach((file) => accessSync(file)); // Fail explicitly instead of silently rendering a card without glyphs.
  return new Resvg(renderShareCardSvg(content), {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: family },
  })
    .render()
    .asPng();
}

export async function handleShareImage(request, options) {
  const headers = {
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  };
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, {
      status: 405,
      headers: { ...headers, Allow: "GET, HEAD" },
    });
  const url = new URL(request.url);
  if (url.pathname !== "/api/share-image") return new Response(null, { status: 404, headers });
  const jpeg = url.searchParams.get("format") === "jpeg";
  if (jpeg) headers["Content-Type"] = "image/jpeg";
  url.pathname = "/api/share";
  const id = shareId(url);
  if (!id) return new Response(null, { status: 404, headers });
  let row;
  let status;
  let content;
  try {
    row = await loadPublicShareRow(id, options);
    status = row ? 200 : 404;
    content = shareCardContent(row);
  } catch {
    status = 503;
    content = {
      ...shareCardContent(null),
      time: "暫時無法載入",
      court: "請稍後再試",
      detail: "最新資訊請開啟球局連結",
    };
  }
  let body = null;
  if (request.method !== "HEAD") {
    const png = renderShareCardPng(content);
    body = jpeg ? await sharp(png).jpeg({ quality: 82, chromaSubsampling: "4:4:4" }).toBuffer() : png;
  }
  return new Response(body, { status, headers });
}
