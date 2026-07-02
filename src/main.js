// ============================================================
//  App 進入點:接篩選列 UI、載入地圖、畫圖釘
// ============================================================
import "./style.css";
import { GOOGLE_MAPS_API_KEY } from "./config.js";
import { COURTS, REGISTERED_PLAYERS, DEMAND_PINS } from "./mockData.js";
import { DEFAULT_FILTER_STATE, filterData } from "./filters.js";
import { loadGoogleMaps, createMap, renderPins } from "./map.js";
import { PLAYER_PIN_URL, DEMAND_PIN_URL } from "./pins.js";

const DATA = { players: REGISTERED_PLAYERS, demands: DEMAND_PINS };

// NTRP 選單的可選值(0.5 一級,涵蓋一般業餘範圍)
const NTRP_STEPS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];

const state = { ...DEFAULT_FILTER_STATE, types: new Set(DEFAULT_FILTER_STATE.types) };

// 地圖相關的執行期物件(沒填 API key 時保持 null)
let google = null;
let map = null;
let infoWindow = null;
let markers = [];

// ------------------------------------------------------------
// 篩選列 UI
// ------------------------------------------------------------
function buildNtrpSelects() {
  const minSel = document.getElementById("ntrp-min");
  const maxSel = document.getElementById("ntrp-max");

  minSel.append(new Option("不限", "min", true, true));
  maxSel.append(new Option("不限", "max", true, true));
  for (const v of NTRP_STEPS) {
    minSel.append(new Option(v.toFixed(1), String(v)));
    maxSel.append(new Option(v.toFixed(1), String(v)));
  }

  minSel.addEventListener("change", () => {
    state.ntrpMin = minSel.value === "min" ? DEFAULT_FILTER_STATE.ntrpMin : Number(minSel.value);
    refresh();
  });
  maxSel.addEventListener("change", () => {
    state.ntrpMax = maxSel.value === "max" ? DEFAULT_FILTER_STATE.ntrpMax : Number(maxSel.value);
    refresh();
  });
}

function bindTypeChips() {
  document.querySelectorAll("#type-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const type = chip.dataset.type;
      if (state.types.has(type)) {
        state.types.delete(type);
        chip.classList.remove("is-active");
      } else {
        state.types.add(type);
        chip.classList.add("is-active");
      }
      refresh();
    });
  });
}

function bindCheckbox(id, key) {
  const box = document.getElementById(id);
  box.addEventListener("change", () => {
    state[key] = box.checked;
    refresh();
  });
}

// ------------------------------------------------------------
// 重新套用篩選:更新統計文字 + 重畫圖釘
// ------------------------------------------------------------
function refresh() {
  const filtered = filterData(DATA, state);

  document.getElementById("stats").textContent =
    `顯示 ${filtered.players.length} 位球友・${filtered.demands.length} 則需求`;

  if (map) {
    infoWindow.close();
    markers = renderPins(google, map, infoWindow, filtered, markers);
  }
}

// ------------------------------------------------------------
// 沒填 API key 時的說明蓋板
// ------------------------------------------------------------
function showPlaceholder() {
  const placeholder = document.getElementById("map-placeholder");
  const list = document.getElementById("placeholder-courts");
  for (const court of COURTS) {
    const players = REGISTERED_PLAYERS.filter((p) => p.homeCourt === court.name).length;
    const demands = DEMAND_PINS.filter((d) => d.court === court.name).length;
    const li = document.createElement("li");
    li.textContent =
      `${court.name}(${court.district})— 球友 ${players} 位・需求 ${demands} 則`;
    list.appendChild(li);
  }
  placeholder.hidden = false;
}

// ------------------------------------------------------------
// 啟動
// ------------------------------------------------------------
async function init() {
  // 圖例用跟地圖圖釘同一組 SVG
  document.getElementById("legend-player").src = PLAYER_PIN_URL;
  document.getElementById("legend-demand").src = DEMAND_PIN_URL;

  buildNtrpSelects();
  bindTypeChips();
  bindCheckbox("include-unknown", "includeUnknown");
  bindCheckbox("show-players", "showPlayers");
  bindCheckbox("show-demands", "showDemands");

  // InfoWindow 裡的「送出邀請」按鈕(內容是動態 HTML,用事件委派接)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-invite]");
    if (btn) alert(`已送出邀請給 ${btn.dataset.invite}!(原型示意,尚未串接後端)`);
  });

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "___") {
    showPlaceholder();
    refresh(); // 仍更新統計文字,讓篩選列可以先玩
    return;
  }

  try {
    google = await loadGoogleMaps(GOOGLE_MAPS_API_KEY);
    map = createMap(google, document.getElementById("map"));
    infoWindow = new google.maps.InfoWindow();
    refresh();
  } catch (err) {
    console.error(err);
    showPlaceholder();
    refresh();
  }
}

init();
