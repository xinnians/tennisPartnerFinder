// ============================================================
//  App 進入點:分頁切換、篩選接線、地圖載入、快速約球與個人檔案狀態
// ============================================================
import "./style.css";
import { GOOGLE_MAPS_API_KEY, MAP_CENTER, MAP_ZOOM } from "./config.js";
import { COURTS, REGISTERED_PLAYERS, DEMAND_PINS } from "./mockData.js";
import { BANDS, TYPES, DEFAULT_FILTER_STATE, filterData } from "./filters.js";
import { loadGoogleMaps, createMap, groupPinsByCourt, renderPins } from "./map.js";
import {
  openPlayerSheet,
  openDemandSheet,
  openCourtDrawer,
  openQuickContactModal,
  closeSheet,
  closeModal,
} from "./sheets.js";
import { esc, ntrpDesc } from "./util.js";

const DATA = { players: REGISTERED_PLAYERS, demands: DEMAND_PINS };

// ------------------------------------------------------------
// App 狀態(原型:全部放記憶體,重新整理就重置)
// ------------------------------------------------------------
const state = {
  filters: { ...DEFAULT_FILTER_STATE, types: new Set(DEFAULT_FILTER_STATE.types) },
  profile: {
    nick: "我",
    ntrp: 3.5,
    types: new Set(["單打", "對拉"]),
    courts: new Set(["大安森林公園網球場"]),
    slots: new Set(["wd-e", "we-m"]),
    share: false,
    lineId: "",
  },
};

// 地圖執行期物件(沒填 API key 時保持 null)
let google = null;
let map = null;
let markers = [];

// ------------------------------------------------------------
// 圖釘互動(球友 sheet → 快速聯絡 modal)
// ------------------------------------------------------------
const pinHandlers = {
  onPlayer: (p) => openPlayerSheet(p, { onQuickContact: startQuickContact }),
  onDemand: (d) => openDemandSheet(d),
  onCluster: (court, items) => openCourtDrawer(court, items, pinHandlers),
};

function contactMissingFields(profile) {
  const missing = [];
  if (!profile.lineId) missing.push("LINE ID");
  if (!profile.ntrp) missing.push("NTRP");
  if (profile.courts.size === 0) missing.push("常打球場");
  return missing;
}

function showToast(message) {
  const toast = document.getElementById("toast-root");
  toast.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.innerHTML = ""), 2200);
}

function startQuickContact(p) {
  const missing = contactMissingFields(state.profile);
  if (missing.length > 0) {
    showToast(`先補齊 ${missing.join("、")}，開場白會比較自然。`);
    switchTab("profile");
    return;
  }

  openQuickContactModal(p, { viewerProfile: state.profile });
}

// ------------------------------------------------------------
// 篩選列(程度 popover + 類型 chips)
// ------------------------------------------------------------
function refreshPins() {
  if (!map) return;
  closeSheet();
  const groups = groupPinsByCourt(COURTS, filterData(DATA, state.filters));
  markers = renderPins(google, map, groups, pinHandlers, markers);
}

function setupLevelPopover() {
  const chip = document.getElementById("level-chip");
  const dim = document.getElementById("level-dim");
  const pop = document.getElementById("level-popover");
  const optsBox = document.getElementById("band-options");
  const bandLabel = document.getElementById("band-label");

  const renderOptions = () => {
    optsBox.innerHTML = BANDS.map(
      (b) => `
      <button type="button" class="popover__opt${b.key === state.filters.band ? " is-active" : ""}" data-band="${b.key}">
        ${esc(b.label)}
        ${
          b.key === state.filters.band
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9E23B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
            : ""
        }
      </button>`
    ).join("");
    optsBox.querySelectorAll("[data-band]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters.band = btn.dataset.band;
        bandLabel.textContent = BANDS.find((b) => b.key === state.filters.band).label;
        toggle(false);
        refreshPins();
      });
    });
  };

  const toggle = (open) => {
    dim.hidden = !open;
    pop.hidden = !open;
    if (open) renderOptions();
  };

  chip.addEventListener("click", () => toggle(pop.hidden));
  dim.addEventListener("click", () => toggle(false));
}

function setupTypeChips() {
  document.querySelectorAll(".chip-type").forEach((chip) => {
    chip.addEventListener("click", () => {
      const type = chip.dataset.type;
      if (state.filters.types.has(type)) {
        state.filters.types.delete(type);
        chip.classList.remove("is-active");
      } else {
        state.filters.types.add(type);
        chip.classList.add("is-active");
      }
      refreshPins();
    });
  });
}

function setupMapControls() {
  document.getElementById("zoom-in").addEventListener("click", () => {
    if (map) map.setZoom(map.getZoom() + 1);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    if (map) map.setZoom(map.getZoom() - 1);
  });
  document.getElementById("recenter").addEventListener("click", () => {
    if (!map) return;
    map.panTo(MAP_CENTER);
    map.setZoom(MAP_ZOOM);
  });
}

// ------------------------------------------------------------
// 分頁切換
// ------------------------------------------------------------
function switchTab(tab) {
  closeSheet();
  closeModal();
  document.querySelectorAll(".tab-panel").forEach((el) => el.classList.remove("is-active"));
  document.getElementById(`tab-${tab}`).classList.add("is-active");
  document.querySelectorAll(".tabbar__btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
}

function setupTabs() {
  document.querySelectorAll(".tabbar__btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

// ------------------------------------------------------------
// 個人檔案分頁(原型:存記憶體 + toast,不落地)
// ------------------------------------------------------------
const SLOT_ROWS = [
  { key: "wd", day: "平日" },
  { key: "we", day: "週末" },
];
const SLOT_COLS = [
  { key: "m", label: "早上" },
  { key: "a", label: "下午" },
  { key: "e", label: "晚上" },
];

function setupProfile() {
  const prof = state.profile;

  // 暱稱 → 頭像字首連動
  const nickInput = document.getElementById("prof-nick");
  nickInput.addEventListener("input", () => {
    prof.nick = nickInput.value.trim() || "我";
    document.getElementById("prof-avatar").textContent = prof.nick.slice(0, 1);
  });

  // NTRP 滑桿
  const range = document.getElementById("prof-ntrp");
  range.addEventListener("input", () => {
    prof.ntrp = parseFloat(range.value);
    document.getElementById("prof-ntrp-val").textContent = prof.ntrp.toFixed(1);
    document.getElementById("prof-ntrp-desc").textContent = ntrpDesc(prof.ntrp);
  });

  // 想打類型
  const typesBox = document.getElementById("prof-types");
  typesBox.innerHTML = TYPES.map(
    (t) => `<button type="button" class="prof-type${prof.types.has(t) ? " is-active" : ""}" data-t="${t}">${esc(t)}</button>`
  ).join("");
  typesBox.querySelectorAll("[data-t]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.t;
      prof.types.has(t) ? prof.types.delete(t) : prof.types.add(t);
      btn.classList.toggle("is-active");
    });
  });

  // 常打球場(清單來自 mockData 的 COURTS)
  const courtsBox = document.getElementById("prof-courts");
  courtsBox.innerHTML = COURTS.map(
    (c) => `
    <button type="button" class="prof-court${prof.courts.has(c.name) ? " is-on" : ""}" data-c="${esc(c.name)}">
      <span class="prof-court__box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9E23B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </span>
      <span class="prof-court__name">${esc(c.name)}</span>
      <span class="prof-court__dist">${esc(c.district)}</span>
    </button>`
  ).join("");
  courtsBox.querySelectorAll("[data-c]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.c;
      prof.courts.has(name) ? prof.courts.delete(name) : prof.courts.add(name);
      btn.classList.toggle("is-on");
    });
  });

  // 固定時段格子
  const slotsBox = document.getElementById("prof-slots");
  slotsBox.innerHTML =
    `<div class="slot-grid__row"><div class="slot-grid__day"></div>${SLOT_COLS.map(
      (c) => `<div class="slot-grid__hdr">${c.label}</div>`
    ).join("")}</div>` +
    SLOT_ROWS.map(
      (r) =>
        `<div class="slot-grid__row"><div class="slot-grid__day">${r.day}</div>${SLOT_COLS.map((c) => {
          const code = `${r.key}-${c.key}`;
          return `<button type="button" class="slot-cell${prof.slots.has(code) ? " is-on" : ""}" data-s="${code}" aria-label="${r.day}${c.label}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16351F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </button>`;
        }).join("")}</div>`
    ).join("");
  slotsBox.querySelectorAll("[data-s]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.s;
      prof.slots.has(code) ? prof.slots.delete(code) : prof.slots.add(code);
      btn.classList.toggle("is-on");
    });
  });

  // 分享位置開關
  const shareBtn = document.getElementById("prof-share");
  shareBtn.addEventListener("click", () => {
    prof.share = !prof.share;
    shareBtn.classList.toggle("is-on", prof.share);
  });

  // LINE ID
  const lineInput = document.getElementById("prof-line");
  lineInput.addEventListener("input", () => {
    prof.lineId = lineInput.value.trim();
  });

  // 儲存 → toast(原型不落地)
  document.getElementById("prof-save").addEventListener("click", () => {
    showToast("已儲存");
  });
}

// ------------------------------------------------------------
// 沒填 API key 時的說明蓋板
// ------------------------------------------------------------
function showPlaceholder() {
  const placeholder = document.getElementById("map-placeholder");
  if (!placeholder.hidden) return; // 已顯示過(可能由多個失敗路徑觸發)
  const list = document.getElementById("placeholder-courts");
  for (const court of COURTS) {
    const players = REGISTERED_PLAYERS.filter((p) => p.homeCourt === court.name).length;
    const demands = DEMAND_PINS.filter((d) => d.court === court.name).length;
    const li = document.createElement("li");
    li.textContent = `${court.name}(${court.district})— 球友 ${players} 位・需求 ${demands} 則`;
    list.appendChild(li);
  }
  placeholder.hidden = false;
}

// ------------------------------------------------------------
// 啟動
// ------------------------------------------------------------
async function init() {
  setupTabs();
  setupLevelPopover();
  setupTypeChips();
  setupMapControls();
  setupProfile();

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "___") {
    showPlaceholder();
    return;
  }

  try {
    // 第二個參數:key 無效/受限時 Google 會非同步回呼,退回說明蓋板
    // 而不是讓使用者看到 Google 的灰色錯誤地圖
    google = await loadGoogleMaps(GOOGLE_MAPS_API_KEY, () => {
      console.warn("Google Maps API key 驗證失敗(無效、受限或未開通帳單)");
      showPlaceholder();
    });
    map = createMap(google, document.getElementById("map"));
    refreshPins();
  } catch (err) {
    console.error(err);
    showPlaceholder();
  }
}

init();
