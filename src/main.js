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
  openLoginModal,
  openPublishRequestModal,
  openReportModal,
  closeSheet,
  closeModal,
} from "./sheets.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import {
  createPartnerRequest,
  createReport,
  getInitialSession,
  loadActivePartnerRequests,
  loadCourts,
  loadCurrentProfile,
  loadDiscoveryPlayers,
  onAuthStateChange,
  saveCurrentProfile,
  signInWithOAuthProvider,
  signOut,
} from "./dataApi.js";
import { esc, ntrpDesc } from "./util.js";
import { mountCourtPicker } from "./courtPicker.js";

let courts = COURTS;
let dataSet = { players: REGISTERED_PLAYERS, demands: DEMAND_PINS };
let courtPicker = null;

function defaultProfile() {
  return {
    nick: "我",
    ntrp: 3.5,
    types: new Set(["單打", "對拉"]),
    courts: new Set(["青年公園網球場"]),
    slots: new Set(["wd-e", "we-m"]),
    share: false,
    lineId: "",
  };
}

// ------------------------------------------------------------
// App 狀態(原型:全部放記憶體,重新整理就重置)
// ------------------------------------------------------------
const state = {
  session: null,
  dataStatus: "idle",
  filters: { ...DEFAULT_FILTER_STATE, types: new Set(DEFAULT_FILTER_STATE.types) },
  profile: defaultProfile(),
};

// 地圖執行期物件(沒填 API key 時保持 null)
let google = null;
let map = null;
let markers = [];

// ------------------------------------------------------------
// 圖釘互動(球友 sheet → 快速聯絡 modal)
// ------------------------------------------------------------
const pinHandlers = {
  onPlayer: (p) => openPlayerSheet(p, { onQuickContact: startQuickContact, onReport: startPlayerReport }),
  onDemand: (d) => openDemandSheet(d, { onReport: startDemandReport }),
  onCluster: (court, items) => openCourtDrawer(court, items, pinHandlers),
};

function contactMissingFields(profile) {
  const missing = [];
  if (!profile.nick || profile.nick === "我") missing.push("暱稱");
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

function setMapStatus(kind, message, subtext = "") {
  const status = document.getElementById("map-status");
  status.hidden = false;
  status.className = `map-status map-status--${kind}`;
  status.innerHTML = `
    <div>${esc(message)}</div>
    ${subtext ? `<div class="map-status__sub">${esc(subtext)}</div>` : ""}
    ${kind === "error" ? `<button type="button" class="map-status__retry" data-retry-map>重新載入</button>` : ""}
  `;
  status.querySelector("[data-retry-map]")?.addEventListener("click", () => {
    refreshDataAndPins();
  });
}

function clearMapStatus() {
  const status = document.getElementById("map-status");
  status.hidden = true;
  status.innerHTML = "";
}

function updateMapDataStatus() {
  if (!isSupabaseConfigured) {
    clearMapStatus();
    return;
  }

  if (state.dataStatus === "loading") {
    setMapStatus("loading", "正在載入球友資料", "同步公開球友與徵球伴需求中");
    return;
  }

  if (state.dataStatus === "error") {
    setMapStatus("error", "資料載入失敗", "請確認 Supabase local stack 後重新載入");
    return;
  }

  if (state.dataStatus === "empty") {
    setMapStatus("empty", "目前沒有公開球友或需求", "可以先建立自己的檔案或發布需求");
    return;
  }

  clearMapStatus();
}

function openAuthPrompt() {
  if (!isSupabaseConfigured) {
    showToast("請先設定 Supabase env。");
    return;
  }
  openLoginModal({
    onProvider: async (provider) => {
      await signInWithOAuthProvider(provider);
    },
  });
}

function ensureSignedInAndCompleteProfile() {
  if (isSupabaseConfigured && !state.session) {
    openAuthPrompt();
    return false;
  }

  const missing = contactMissingFields(state.profile);
  if (missing.length > 0) {
    showToast(`先補齊 ${missing.join("、")}，開場白會比較自然。`);
    switchTab("profile");
    closeSheet();
    return false;
  }

  return true;
}

function startQuickContact(p) {
  if (!ensureSignedInAndCompleteProfile()) return;

  openQuickContactModal(p, {
    viewerProfile: state.profile,
    onPublishRequest: () => startPublishRequest(),
  });
}

function ensureCanReport() {
  if (!isSupabaseConfigured) {
    showToast("檢舉功能需要 Supabase 環境。");
    return false;
  }

  if (!state.session) {
    openAuthPrompt();
    return false;
  }

  if (!state.profile.id) {
    showToast("檢舉前請先建立個人檔案");
    switchTab("profile");
    closeSheet();
    return false;
  }

  return true;
}

function startPlayerReport(player) {
  if (!ensureCanReport()) return;
  if (!player.profileId) {
    showToast("目前不能檢舉這筆球友資料。");
    return;
  }

  openReportModal(
    {
      title: `檢舉 ${player.displayName}`,
      subtitle: `${player.homeCourt}・NTRP ${player.ntrp.toFixed(1)}`,
    },
    {
      onSubmit: async (reason) => {
        await createReport({ reportedProfileId: player.profileId, reason });
        closeModal();
        showToast("已收到檢舉");
      },
    }
  );
}

function startDemandReport(demand) {
  if (!ensureCanReport()) return;
  if (!demand.requestId) {
    showToast("目前不能檢舉這筆需求。");
    return;
  }

  openReportModal(
    {
      title: "檢舉需求",
      subtitle: `${demand.court}・${demand.rawSkill ?? "程度未提供"}`,
    },
    {
      onSubmit: async (reason) => {
        await createReport({ partnerRequestId: demand.requestId, reason });
        closeModal();
        showToast("已收到檢舉");
      },
    }
  );
}

// ------------------------------------------------------------
// 篩選列(程度 popover + 類型 chips)
// ------------------------------------------------------------
function refreshPins() {
  if (!map) return;
  closeSheet();
  const groups = groupPinsByCourt(courts, filterData(dataSet, state.filters));
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

function setupPublishRequest() {
  document.getElementById("publish-request").addEventListener("click", () => startPublishRequest());
}

async function loadAppData() {
  if (!isSupabaseConfigured) {
    state.dataStatus = "ready";
    updateMapDataStatus();
    courts = COURTS;
    dataSet = { players: REGISTERED_PLAYERS, demands: DEMAND_PINS };
    courtPicker?.setCourts(courts);
    return;
  }

  state.dataStatus = "loading";
  updateMapDataStatus();

  try {
    const [nextCourts, players, demands] = await Promise.all([
      loadCourts(),
      loadDiscoveryPlayers(),
      loadActivePartnerRequests(),
    ]);
    courts = nextCourts.length ? nextCourts : COURTS;
    dataSet = { players, demands };
    courtPicker?.setCourts(courts);
    state.dataStatus = players.length === 0 && demands.length === 0 ? "empty" : "ready";
    updateMapDataStatus();
  } catch (error) {
    console.error(error);
    courts = [];
    dataSet = { players: [], demands: [] };
    state.dataStatus = "error";
    updateMapDataStatus();
  }
}

async function refreshDataAndPins() {
  await loadAppData();
  refreshPins();
}

async function startPublishRequest() {
  if (!ensureSignedInAndCompleteProfile()) return;

  openPublishRequestModal(courts, {
    onSubmit: async (request) => {
      const court = courts.find((item) => String(item.id ?? item.name) === String(request.courtId));
      if (!court?.id) throw new Error("找不到可發布的球場");
      await createPartnerRequest({
        courtId: court.id,
        desiredTimeText: request.desiredTimeText,
        rawSkillText: request.rawSkillText,
        requestText: request.requestText,
      });
      await refreshDataAndPins();
      showToast("需求已發布");
    },
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

function updateAuthStatus() {
  const labels = document.querySelectorAll("[data-auth-status]");
  const buttons = document.querySelectorAll("[data-auth-action]");

  if (!isSupabaseConfigured) {
    labels.forEach((label) => (label.textContent = "原型"));
    buttons.forEach((button) => {
      button.textContent = "登入";
      button.disabled = true;
    });
    return;
  }

  if (state.session) {
    labels.forEach((label) => (label.textContent = authDisplayName(state.session.user)));
    buttons.forEach((button) => {
      button.textContent = "登出";
      button.disabled = false;
    });
  } else {
    labels.forEach((label) => (label.textContent = "未登入"));
    buttons.forEach((button) => {
      button.textContent = "登入";
      button.disabled = false;
    });
  }
}

function authDisplayName(user) {
  return (
    user?.email ||
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.user_name ||
    "已登入"
  );
}

function replaceProfile(profile) {
  state.profile.id = profile.id;
  state.profile.nick = profile.nick;
  state.profile.ntrp = profile.ntrp;
  state.profile.types = new Set(profile.types);
  state.profile.courts = new Set(profile.courts);
  state.profile.slots = new Set(profile.slots);
  state.profile.share = profile.share;
  state.profile.lineId = profile.lineId;
}

function resetProfile() {
  replaceProfile(defaultProfile());
  syncProfileForm();
}

async function loadSignedInProfile() {
  if (!state.session || !isSupabaseConfigured) return;
  const profile = await loadCurrentProfile();
  if (profile) {
    replaceProfile(profile);
    syncProfileForm();
  }
}

async function initializeAuth() {
  state.session = await getInitialSession();
  await loadSignedInProfile();
  updateAuthStatus();

  onAuthStateChange(async (session) => {
    state.session = session;
    if (session) await loadSignedInProfile();
    else resetProfile();
    updateAuthStatus();
  });
}

function setupAuthControls() {
  document.querySelectorAll("[data-auth-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.session) {
        button.disabled = true;
        await signOut();
        state.session = null;
        resetProfile();
        updateAuthStatus();
        showToast("已登出");
        return;
      }
      openAuthPrompt();
    });
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

  // 常打球場(分區＋搜尋,資料來自 loadAppData 的 courts)
  courtPicker = mountCourtPicker(document.getElementById("prof-courts"), {
    getSelected: () => prof.courts,
    onToggle: (name) => {
      prof.courts.has(name) ? prof.courts.delete(name) : prof.courts.add(name);
      courtPicker.refresh();
    },
  });
  courtPicker.setCourts(courts); // 初次=mock COURTS(mock 模式維持 6 座示範)

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
    if (!prof.share) {
      const missing = contactMissingFields(prof);
      if (missing.length > 0) {
        showToast(`公開前請先補齊 ${missing.join("、")}`);
        shareBtn.classList.remove("is-on");
        return;
      }
    }
    prof.share = !prof.share;
    shareBtn.classList.toggle("is-on", prof.share);
  });

  // LINE ID
  const lineInput = document.getElementById("prof-line");
  lineInput.addEventListener("input", () => {
    prof.lineId = lineInput.value.trim();
  });

  // 儲存:未設定 Supabase 時維持原型 toast;有設定時寫入目前登入使用者的 profile。
  document.getElementById("prof-save").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!isSupabaseConfigured) {
      showToast("已儲存");
      return;
    }

    if (!state.session) {
      openAuthPrompt();
      return;
    }

    button.disabled = true;
    try {
      const savedProfile = await saveCurrentProfile(prof);
      if (savedProfile) {
        replaceProfile(savedProfile);
        syncProfileForm();
      }
      await refreshDataAndPins();
      showToast("已儲存到 Supabase");
    } catch (error) {
      console.error(error);
      showToast("儲存失敗，請稍後再試。");
    } finally {
      button.disabled = false;
    }
  });
}

function syncProfileForm() {
  const prof = state.profile;
  document.getElementById("prof-nick").value = prof.nick;
  document.getElementById("prof-avatar").textContent = prof.nick.slice(0, 1);
  document.getElementById("prof-ntrp").value = String(prof.ntrp);
  document.getElementById("prof-ntrp-val").textContent = prof.ntrp.toFixed(1);
  document.getElementById("prof-ntrp-desc").textContent = ntrpDesc(prof.ntrp);
  document.getElementById("prof-line").value = prof.lineId;
  document.getElementById("prof-share").classList.toggle("is-on", prof.share);

  document.querySelectorAll("#prof-types [data-t]").forEach((btn) => {
    btn.classList.toggle("is-active", prof.types.has(btn.dataset.t));
  });
  courtPicker?.refresh();
  document.querySelectorAll("#prof-slots [data-s]").forEach((btn) => {
    btn.classList.toggle("is-on", prof.slots.has(btn.dataset.s));
  });
}

// ------------------------------------------------------------
// 沒填 API key 時的說明蓋板
// ------------------------------------------------------------
function showPlaceholder() {
  const placeholder = document.getElementById("map-placeholder");
  if (!placeholder.hidden) return; // 已顯示過(可能由多個失敗路徑觸發)
  const list = document.getElementById("placeholder-courts");
  for (const court of courts) {
    const players = dataSet.players.filter((p) => p.homeCourt === court.name).length;
    const demands = dataSet.demands.filter((d) => d.court === court.name).length;
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
  setupPublishRequest();
  setupProfile();
  setupAuthControls();
  await initializeAuth();
  await loadAppData();

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
