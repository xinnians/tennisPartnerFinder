import { readFileSync } from "node:fs";
import { escapeHtml as esc } from "../server/sharePage.js";
import { COURT_GUIDE_NAMES } from "../src/features/guides/courtGuideLinks.ts";

const courts = JSON.parse(readFileSync(new URL("../data/courts.json", import.meta.url), "utf8")).courts;
const content = JSON.parse(readFileSync(new URL("../data/court-guides.json", import.meta.url), "utf8")).guides;
export const guides = content.map((guide) => {
  const matches = courts.filter((court) => court.slug === guide.slug && court.city === "台北市");
  if (matches.length !== 1 || COURT_GUIDE_NAMES[guide.slug] !== matches[0].name)
    throw new Error("Invalid court guide catalogue reference");
  for (const source of guide.sources) {
    if (new URL(source.url).protocol !== "https:" || !/^\d{4}-\d{2}-\d{2}$/.test(source.verifiedAt))
      throw new Error("Invalid guide source");
  }
  return { ...guide, ...matches[0] };
});
if (new Set(guides.map((guide) => guide.slug)).size !== guides.length) throw new Error("Duplicate court guide slug");

const arrow =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg>';
const external =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
const sourceLink = (source, text = "官方場地資訊") =>
  `<a class="guide-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(text)} ${external}<span class="sr-only">（另開分頁）</span></a>`;
const logo =
  '<a class="guide-brand" href="/" aria-label="球咖首頁"><img src="/icon.svg" width="30" height="30" alt="">球咖</a>';
const footer = `<footer class="guide-footer">${logo}<span>場地資訊以官方公告為準。</span><a href="/courts/">回到球場指南</a></footer>`;

export function renderGuidePage(slug, { script = "", styles = [], production = false, now = Date.now() } = {}) {
  const guide = slug ? guides.find((item) => item.slug === slug) : null;
  if (slug && !guide) return null;
  const path = guide ? `/courts/${guide.slug}/` : "/courts/";
  const title = guide ? `${guide.name}｜球場指南｜球咖` : "球場指南｜球咖";
  const description = guide?.summary || "先了解場地，再找到一起打球的人。台北網球球場的租借、開放與交通資訊。";
  const canonical = `https://qiuka.tw${path}`;
  const header = `<header class="guide-header"><div>${logo}<nav aria-label="主要導覽"><a href="/">找球局</a><a class="guide-nav-current" href="/courts/" aria-current="${guide ? "location" : "page"}">球場指南</a></nav></div></header>`;
  const body = guide ? detail(guide, now) : index();
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta property="og:image" content="https://qiuka.tw/og.png"><meta property="og:locale" content="zh_TW">${production ? "" : '<meta name="robots" content="noindex,follow">'}<link rel="icon" href="/icon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800&display=swap" rel="stylesheet">${styles.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join("")}${script ? `<script type="module" src="${esc(script)}"></script>` : ""}</head><body class="guide-body"><a class="guide-skip" href="#guide-main">跳到主要內容</a>${header}${body}${footer}</body></html>`;
}

function index() {
  return `<main class="guide-container guide-index" id="guide-main"><h1>球場指南</h1><p class="guide-intro">先了解場地，再找到一起打球的人。</p><div class="guide-grid">${guides.map((g) => `<article class="guide-index-card"><h2>${esc(g.name)}</h2><p class="guide-district">${esc(g.district)}</p><p>${esc(g.summary)}</p><a class="guide-link" href="/courts/${g.slug}/">查看指南 ${arrow}<span class="sr-only">：${esc(g.name)}</span></a></article>`).join("")}</div><section class="guide-discover"><h2>想先看看有哪些球局？</h2><p>回到地圖，找一場適合自己的球局。</p><a class="guide-button guide-button-outline" href="/">前往找球局 ${arrow}</a></section></main>`;
}

function detail(g, now) {
  const action = `/?courtGuide=${g.slug}&amp;guideAction=`;
  const stale = g.sources.some((s) => now - Date.parse(s.verifiedAt) > 90 * 86_400_000);
  const map = `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}`;
  return `<main id="guide-main" class="guide-container guide-detail" data-court-guide="${g.slug}"><a class="guide-back" href="/courts/">← 球場指南</a><div class="guide-detail-grid"><div class="guide-heading"><h1>${esc(g.name)}</h1><p class="guide-district">${esc(g.district)}</p><p class="guide-intro">先了解場地，再約一場球。</p></div><aside class="guide-aside" aria-label="這座球場的球局"><a class="guide-button guide-button-primary" href="${action}create#tab-map">在這裡開球局</a><a class="guide-subscribe" href="${action}subscribe#tab-me">管理球場訂閱</a><section class="guide-sessions" aria-labelledby="guide-sessions-title"><h2 id="guide-sessions-title">近期球局</h2><p class="guide-muted">未來 14 天・已定場</p><div id="guide-session-list" aria-live="polite"><p>正在載入球局…</p><noscript>請啟用 JavaScript 查看近期球局，或<a href="/">前往找球局</a>。</noscript></div><p class="guide-caption">最新名額與場地以球局詳情為準。</p></section></aside><div class="guide-content"><section><h2>租借方式</h2><p>${esc(g.booking)}</p>${sourceLink(g.sources[g.bookingSource])}</section><section><h2>開放與設施</h2><dl>${g.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(stale ? "資訊待重新確認，請查看官方最新公告。" : f.value)}${f.status === "pending" && !stale ? '<span class="guide-pending">待確認</span>' : ""}</dd></div>`).join("")}</dl></section><section><h2>交通方式</h2><p>${esc(g.transport)}</p><a class="guide-button guide-button-outline" href="${esc(map)}" target="_blank" rel="noopener noreferrer">查看路線 ${external}<span class="sr-only">（另開分頁）</span></a></section><section class="guide-sources"><h2>資料來源</h2>${g.sources.map((s) => `<p>${sourceLink(s, s.title)}<br><span class="guide-caption">查核日期：${esc(s.verifiedAt.replaceAll("-", "/"))}</span></p>`).join("")}<p class="guide-caption">${stale ? "資訊已超過 90 天未查核，出發前請查看官方最新公告。" : "營運資訊如有異動，以管理單位公告為準。"}</p></section></div></div></main>`;
}
