// 批 11-A:sessionController 的「呼叫序列」常駐回歸測試。
//
// 為什麼要有這一支:批 9a 把 controller 的渲染狀態收進 minimal store 時做了三發 canary,
// 既有 113 條 controller 單元測試只抓到其中一發。漏掉的兩發(「派發被值比對合併掉」與
// 「某欄寫入繞過 store」)都不改變任何單一斷言的最終值,只改變 renderer 收到的呼叫次序
// 與次數——那批用一支臨時 probe 才抓到。臨時 probe 跑完就沒了,所以本檔把它固化。
//
// 斷言面刻意不是「最終狀態對不對」,而是「整段操作打出來的呼叫序列逐筆相同」:
// 每次 render / renderPins / renderPlayers / onMySessionsChange / 表單 setCourts 直呼 /
// toast 都按發生順序記一筆 `步驟|通道|payload 指紋`,與寫死在本檔的 GOLDEN 逐筆比對。
// 因此「多派發一次」「少派發一次」「兩次派發被合併成一次」「次序對調」全都會紅。
//
// 時間:所有 startAt 用固定的 2099 年常數,不依賴真實時鐘;2099 恆在未來,
// isDiscoverableSession 與 sortSessionsForDrawer 的結果因此可重現。

import assert from "node:assert/strict";
import test from "node:test";

import { createSessionController } from "../src/sessionController.js";

const SESSION_A_START = "2099-01-02T02:00:00.000Z";
const SESSION_B_START = "2099-01-03T02:00:00.000Z";

const BOUNDS_A = { south: 25.0, west: 121.5, north: 25.06, east: 121.6 };
const BOUNDS_B = { south: 25.01, west: 121.51, north: 25.05, east: 121.58 };

const COURTS = [
  { id: 8, name: "示範球場", district: "大安區", lat: 25.03, lng: 121.54 },
  { id: 9, name: "第二球場", district: "信義區", lat: 25.04, lng: 121.56 },
];

function sessionRow(overrides = {}) {
  return {
    sessionId: 41,
    sportCode: "tennis",
    courtId: 8,
    court: "示範球場",
    courtDistrict: "大安區",
    courtLat: 25.03,
    courtLng: 121.54,
    startAt: SESSION_A_START,
    playType: "單打",
    ntrpMin: 3,
    ntrpMax: 4,
    slotsTotal: 2,
    slotsRemaining: 1,
    notes: "測試球局",
    hostNickname: "示範松果",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    status: "open",
    venueType: "booked",
    joinMode: "approval",
    rangeEnd: "",
    candidateCourtIds: [],
    feeNote: "",
    decidedAt: "",
    ...overrides,
  };
}

const DISCOVERY_ROWS = [
  sessionRow({ sessionId: 41 }),
  sessionRow({
    sessionId: 42,
    court: "第二球場",
    courtDistrict: "信義區",
    courtId: 9,
    courtLat: 25.04,
    courtLng: 121.56,
    playType: "雙打",
    ntrpMin: 4,
    ntrpMax: 5,
    startAt: SESSION_B_START,
  }),
];

const MY_SESSION_ROWS = [
  {
    sessionId: 41,
    court: "示範球場",
    startAt: SESSION_A_START,
    status: "open",
    viewerRole: "guest",
    viewerParticipantStatus: "accepted",
    canWithdraw: true,
    canCancel: false,
    unreadMessageCount: 0,
  },
];

const BLOCK_ROWS = [{ blockedProfileId: 77, nickname: "封鎖對象" }];

const PRESENCE_ROWS = [
  {
    profileId: 91,
    nickname: "在場球友",
    ntrp: 3.5,
    courtId: 8,
    courtName: "示範球場",
    courtDistrict: "大安區",
    courtLat: 25.03,
    courtLng: 121.54,
    minutesAgo: 4,
    openToGreeting: true,
  },
];

const NTRP_PROFILE = { directory: false, nickname: true, ntrp: true, isPublic: false };

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function idList(items, key = "sessionId") {
  return `[${(Array.isArray(items) ? items : []).map((item) => item?.[key]).join(",")}]`;
}

function filterPrint(filters) {
  const types = [...(filters?.types ?? [])].map(String).sort();
  const districts = [...(filters?.districts ?? [])].map(String).sort();
  return `date=${filters?.dateKey ?? "null"} band=${filters?.band ?? ""} instant=${
    filters?.instantOnly ? 1 : 0
  } types=[${types.join(",")}] districts=[${districts.join(",")}]`;
}

/**
 * 錄製 controller 的對外呼叫序列。每一筆是 `步驟|通道|payload 指紋`,
 * 指紋只取「決定畫面的欄位」,不含物件 identity 與函式,所以可以寫死成 golden。
 */
function createRecorder() {
  const entries = [];
  let step = "init";
  const push = (channel, print) => entries.push(`${step}|${channel}|${print}`);
  return {
    entries,
    push,
    begin(name) {
      step = name;
      entries.push(`${name}|step|--`);
    },
  };
}

function createSequenceHarness() {
  const recorder = createRecorder();
  const discoveryQueue = [];
  const api = {
    loadSessionDiscovery: async () => {
      const next = discoveryQueue.shift();
      if (typeof next === "function") return next();
      return DISCOVERY_ROWS;
    },
    loadMySessions: async () => MY_SESSION_ROWS,
    // roster fake 必須存在:hydrateMySessionRosters 在 api 缺 loadSessionRoster 時提前
    // return,會跳過收尾的 notifyMySessions——那一拍(每個 sign-in 步的重複 loading 通知)
    // 也是凍結面的一部分。fixture 全為 guest 局,hydrate targets 恆空,此 fake 不會被呼叫,
    // 但它的存在讓收尾派發路徑走到底,與批 9a probe 的 107 筆序列對齊。
    loadSessionRoster: async () => [],
    loadMyPlayerBlocks: async () => BLOCK_ROWS,
    loadPlayerPresenceDirectory: async () => PRESENCE_ROWS,
  };
  const intent = { value: null };
  const intentStore = {
    clear() {
      intent.value = null;
    },
    read: () => intent.value,
    save(next) {
      intent.value = next;
      return next;
    },
  };
  const createSheets = [];
  const controller = createSessionController({
    api,
    intentStore,
    // 輪詢在本檔不參與序列:間隔設得遠大於單次測試時間,可見度目標留空。
    chatPollIntervalMs: 60 * 60 * 1000,
    discoveryPollIntervalMs: 60 * 60 * 1000,
    visibilityTarget: null,
    render: (view) => {
      recorder.push(
        "render",
        `sessions=${idList(view.sessions)} drawer=${view.drawerState} userLoc=${
          view.hasUserLocation ? 1 : 0
        } ${filterPrint(view.filters)} courts=${idList(view.courts, "id")} map=${view.mapStatus.kind}:"${
          view.mapStatus.message
        }" locMsg="${view.locationMessage}"`
      );
    },
    renderPins: (sessions) => recorder.push("pins", idList(sessions)),
    renderPlayers: (view) => {
      const groups = view.groups
        .map((group) => `${group.court.id}:${group.players.length}/${group.presenceCount}`)
        .join(",");
      recorder.push("players", `on=${view.on ? 1 : 0} status=${view.status} msg="${view.message}" groups=[${groups}]`);
    },
    onMySessionsChange: (state) => {
      recorder.push(
        "mySessions",
        `auth=${state.authenticated ? 1 : 0} status=${state.status} err="${state.error}" public=${
          state.isPublic ? 1 : 0
        } gen=${state.viewGeneration} blocked=${state.blockedPlayers.length}:${state.blockedPlayersStatus}:"${
          state.blockedPlayersError
        }" needsAction=${state.groups.needsActionCount} upcoming=${idList(state.groups.upcoming)} history=${idList(
          state.groups.history
        )} unread=${state.groups.hasUnread ? 1 : 0}`
      );
    },
    openCreateSession: (handlers) => {
      const sheet = {
        close: () => {},
        setCourts: (courts, options) =>
          recorder.push(
            "surface:createSession:setCourts",
            `courts=${idList(courts, "id")} ready=${options?.ready ? 1 : 0}`
          ),
      };
      createSheets.push({ handlers, sheet });
      return sheet;
    },
    openLogin: () => ({ close: () => {} }),
    toast: (message) => recorder.push("toast", `"${message}"`),
  });
  return { controller, createSheets, discoveryQueue, recorder };
}

/** 讓 requestCurrentLocation 走「使用者拒絕」分支,呼叫結束就還原 navigator。 */
function withDeniedGeolocation(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { geolocation: { getCurrentPosition: (_onSuccess, onError) => onError({ code: 1 }) } },
  });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
}

/**
 * 17 步腳本。步與步之間沒有共享的隱含狀態重設——每一步都接續前一步的 controller,
 * 因此序列本身也涵蓋「上一步留下的狀態有沒有影響下一步的派發」。
 */
async function driveSequence() {
  const harness = createSequenceHarness();
  const { controller, recorder } = harness;

  recorder.begin("setCourts");
  controller.setCourts(COURTS);

  recorder.begin("initial-discovery");
  await controller.loadDiscovery(BOUNDS_A);

  recorder.begin("bounds-change");
  await controller.loadDiscovery(BOUNDS_B);

  recorder.begin("drawer");
  controller.setDrawerState("open");
  controller.setDrawerState("half"); // 非法值:零派發
  controller.setDrawerState("collapsed");

  recorder.begin("filters");
  controller.setFilter("band", "mid");
  controller.setFilter("types", new Set(["單打"]));
  controller.setFilter("districts", new Set(["大安區"]));
  controller.resetFilters();

  recorder.begin("sign-in");
  await controller.setAuthState({ user: { id: "sequence-viewer" } }, NTRP_PROFILE);

  recorder.begin("courts-channel-with-open-form");
  controller.openCreateIntent();
  await flush();
  controller.setCourts(COURTS);
  controller.setCourts([], { ready: false });

  recorder.begin("blocks");
  await controller.refreshMyPlayerBlocks();

  recorder.begin("player-layer-on");
  await controller.togglePlayerLayer();

  recorder.begin("player-layer-off");
  await controller.togglePlayerLayer();

  recorder.begin("gate-superseded");
  const stale = deferred();
  harness.discoveryQueue.push(() => stale.promise);
  const staleLoad = controller.loadDiscovery(BOUNDS_A);
  const freshLoad = controller.loadDiscovery(BOUNDS_B);
  await freshLoad;
  stale.resolve([sessionRow({ sessionId: 99 })]);
  await staleLoad;
  await flush();

  recorder.begin("discovery-error");
  harness.discoveryQueue.push(() => {
    throw new Error("discovery unavailable");
  });
  await controller.loadDiscovery(BOUNDS_A);

  recorder.begin("map-unavailable");
  controller.setMapUnavailable();

  recorder.begin("location-denied");
  withDeniedGeolocation(() => controller.requestCurrentLocation());
  controller.requestCurrentLocation(); // 已封鎖:走第一個分支,仍派發一次

  recorder.begin("getters");
  recorder.push("getter:getVisibleSessions", idList(controller.getVisibleSessions()));
  recorder.push("getter:getMySessions", idList(controller.getMySessions()));
  const groups = controller.getMySessionGroups();
  recorder.push(
    "getter:getMySessionGroups",
    `needsAction=${groups.needsActionCount} upcoming=${idList(groups.upcoming)} history=${idList(groups.history)}`
  );
  const mySessionState = controller.getMySessionState();
  recorder.push(
    "getter:getMySessionState",
    `auth=${mySessionState.authenticated ? 1 : 0} status=${mySessionState.status} gen=${mySessionState.viewGeneration} blocked=${mySessionState.blockedPlayers.length}`
  );
  const playerLayerState = controller.getPlayerLayerState();
  recorder.push(
    "getter:getPlayerLayerState",
    `on=${playerLayerState.on ? 1 : 0} status=${playerLayerState.status} groups=${playerLayerState.groups.length}`
  );

  recorder.begin("sign-out");
  await controller.setAuthState(null, null);

  recorder.begin("sign-in-other-account");
  await controller.setAuthState({ user: { id: "sequence-other" } }, NTRP_PROFILE);

  return recorder.entries;
}

/**
 * 2026-08-23 批 1 收尾恢復 2026-08-19 工作樹逐字錄製的完整 payload 表。要改這張表,
 * 只有兩種正當理由:
 * (1) 刻意改了 controller 的派發行為,或 (2) 刻意改了本檔的腳本/指紋欄位。
 * 兩者都要在報告裡說明「哪一筆為什麼變」——不可為了讓測試變綠而重錄。
 */
const GOLDEN = [
  "setCourts|step|--",
  'setCourts|render|sessions=[] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "setCourts|pins|[]",
  'setCourts|players|on=0 status=idle msg="" groups=[]',
  "initial-discovery|step|--",
  'initial-discovery|render|sessions=[] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=loading:"正在載入球局資料…" locMsg=""',
  "initial-discovery|pins|[]",
  'initial-discovery|players|on=0 status=idle msg="" groups=[]',
  'initial-discovery|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "initial-discovery|pins|[41,42]",
  'initial-discovery|players|on=0 status=idle msg="" groups=[]',
  "bounds-change|step|--",
  'bounds-change|render|sessions=[] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=loading:"正在載入球局資料…" locMsg=""',
  "bounds-change|pins|[]",
  'bounds-change|players|on=0 status=idle msg="" groups=[]',
  'bounds-change|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "bounds-change|pins|[41,42]",
  'bounds-change|players|on=0 status=idle msg="" groups=[]',
  "drawer|step|--",
  'drawer|render|sessions=[41,42] drawer=open userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "drawer|pins|[41,42]",
  'drawer|players|on=0 status=idle msg="" groups=[]',
  'drawer|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "drawer|pins|[41,42]",
  'drawer|players|on=0 status=idle msg="" groups=[]',
  "filters|step|--",
  'filters|render|sessions=[41] drawer=collapsed userLoc=0 date=null band=mid instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "filters|pins|[41]",
  'filters|players|on=0 status=idle msg="" groups=[]',
  'filters|render|sessions=[41] drawer=collapsed userLoc=0 date=null band=mid instant=0 types=[單打] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "filters|pins|[41]",
  'filters|players|on=0 status=idle msg="" groups=[]',
  'filters|render|sessions=[41] drawer=collapsed userLoc=0 date=null band=mid instant=0 types=[單打] districts=[大安區] courts=[8,9] map=idle:"" locMsg=""',
  "filters|pins|[41]",
  'filters|players|on=0 status=idle msg="" groups=[]',
  'filters|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "filters|pins|[41,42]",
  'filters|players|on=0 status=idle msg="" groups=[]',
  "sign-in|step|--",
  'sign-in|mySessions|auth=1 status=loading err="" public=0 gen=1 blocked=0:idle:"" needsAction=0 upcoming=[] history=[] unread=0',
  'sign-in|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "sign-in|pins|[41,42]",
  'sign-in|players|on=0 status=idle msg="" groups=[]',
  'sign-in|mySessions|auth=1 status=loading err="" public=0 gen=1 blocked=0:idle:"" needsAction=0 upcoming=[] history=[] unread=0',
  'sign-in|mySessions|auth=1 status=loading err="" public=0 gen=1 blocked=0:idle:"" needsAction=0 upcoming=[41] history=[] unread=0',
  'sign-in|mySessions|auth=1 status=loading err="" public=0 gen=1 blocked=0:idle:"" needsAction=0 upcoming=[41] history=[] unread=0',
  'sign-in|mySessions|auth=1 status=ready err="" public=0 gen=1 blocked=0:idle:"" needsAction=0 upcoming=[41] history=[] unread=0',
  'sign-in|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "sign-in|pins|[41,42]",
  'sign-in|players|on=0 status=idle msg="" groups=[]',
  "courts-channel-with-open-form|step|--",
  "courts-channel-with-open-form|surface:createSession:setCourts|courts=[8,9] ready=1",
  'courts-channel-with-open-form|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[8,9] map=idle:"" locMsg=""',
  "courts-channel-with-open-form|pins|[41,42]",
  'courts-channel-with-open-form|players|on=0 status=idle msg="" groups=[]',
  "courts-channel-with-open-form|surface:createSession:setCourts|courts=[] ready=0",
  'courts-channel-with-open-form|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=idle:"" locMsg=""',
  "courts-channel-with-open-form|pins|[41,42]",
  'courts-channel-with-open-form|players|on=0 status=idle msg="" groups=[]',
  "blocks|step|--",
  'blocks|mySessions|auth=1 status=ready err="" public=0 gen=1 blocked=0:loading:"" needsAction=0 upcoming=[41] history=[] unread=0',
  'blocks|mySessions|auth=1 status=ready err="" public=0 gen=1 blocked=1:ready:"" needsAction=0 upcoming=[41] history=[] unread=0',
  "player-layer-on|step|--",
  'player-layer-on|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=idle:"" locMsg=""',
  "player-layer-on|pins|[41,42]",
  'player-layer-on|players|on=1 status=loading msg="正在載入在線球友…" groups=[]',
  'player-layer-on|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=idle:"" locMsg=""',
  "player-layer-on|pins|[41,42]",
  'player-layer-on|players|on=1 status=ready msg="" groups=[8:1/1]',
  "player-layer-off|step|--",
  'player-layer-off|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=idle:"" locMsg=""',
  "player-layer-off|pins|[41,42]",
  'player-layer-off|players|on=0 status=idle msg="" groups=[]',
  "gate-superseded|step|--",
  'gate-superseded|render|sessions=[] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=loading:"正在載入球局資料…" locMsg=""',
  "gate-superseded|pins|[]",
  'gate-superseded|players|on=0 status=idle msg="" groups=[]',
  'gate-superseded|render|sessions=[] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=loading:"正在載入球局資料…" locMsg=""',
  "gate-superseded|pins|[]",
  'gate-superseded|players|on=0 status=idle msg="" groups=[]',
  'gate-superseded|render|sessions=[41,42] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=idle:"" locMsg=""',
  "gate-superseded|pins|[41,42]",
  'gate-superseded|players|on=0 status=idle msg="" groups=[]',
  "discovery-error|step|--",
  'discovery-error|render|sessions=[] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=loading:"正在載入球局資料…" locMsg=""',
  "discovery-error|pins|[]",
  'discovery-error|players|on=0 status=idle msg="" groups=[]',
  'discovery-error|render|sessions=[] drawer=collapsed userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=error:"球局資料暫時無法載入。" locMsg=""',
  "discovery-error|pins|[]",
  'discovery-error|players|on=0 status=idle msg="" groups=[]',
  "map-unavailable|step|--",
  'map-unavailable|render|sessions=[] drawer=open userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=warning:"地圖目前無法使用；你仍可瀏覽附近球局。" locMsg=""',
  "map-unavailable|pins|[]",
  'map-unavailable|players|on=0 status=idle msg="" groups=[]',
  "location-denied|step|--",
  'location-denied|render|sessions=[] drawer=open userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=warning:"地圖目前無法使用；你仍可瀏覽附近球局。" locMsg="無法取得位置；你仍可移動地圖或依球場尋找球局。"',
  "location-denied|pins|[]",
  'location-denied|players|on=0 status=idle msg="" groups=[]',
  'location-denied|render|sessions=[] drawer=open userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=warning:"地圖目前無法使用；你仍可瀏覽附近球局。" locMsg="無法取得位置；你仍可移動地圖或依球場尋找球局。"',
  "location-denied|pins|[]",
  'location-denied|players|on=0 status=idle msg="" groups=[]',
  "getters|step|--",
  "getters|getter:getVisibleSessions|[]",
  "getters|getter:getMySessions|[41]",
  "getters|getter:getMySessionGroups|needsAction=0 upcoming=[41] history=[]",
  "getters|getter:getMySessionState|auth=1 status=ready gen=1 blocked=1",
  "getters|getter:getPlayerLayerState|on=0 status=idle groups=0",
  "sign-out|step|--",
  'sign-out|mySessions|auth=0 status=idle err="" public=0 gen=2 blocked=0:idle:"" needsAction=0 upcoming=[] history=[] unread=0',
  'sign-out|render|sessions=[] drawer=open userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=warning:"地圖目前無法使用；你仍可瀏覽附近球局。" locMsg="無法取得位置；你仍可移動地圖或依球場尋找球局。"',
  "sign-out|pins|[]",
  'sign-out|players|on=0 status=idle msg="" groups=[]',
  "sign-in-other-account|step|--",
  'sign-in-other-account|mySessions|auth=1 status=loading err="" public=0 gen=3 blocked=0:idle:"" needsAction=0 upcoming=[] history=[] unread=0',
  'sign-in-other-account|render|sessions=[] drawer=open userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=warning:"地圖目前無法使用；你仍可瀏覽附近球局。" locMsg="無法取得位置；你仍可移動地圖或依球場尋找球局。"',
  "sign-in-other-account|pins|[]",
  'sign-in-other-account|players|on=0 status=idle msg="" groups=[]',
  'sign-in-other-account|mySessions|auth=1 status=loading err="" public=0 gen=3 blocked=0:idle:"" needsAction=0 upcoming=[] history=[] unread=0',
  'sign-in-other-account|mySessions|auth=1 status=loading err="" public=0 gen=3 blocked=0:idle:"" needsAction=0 upcoming=[41] history=[] unread=0',
  'sign-in-other-account|mySessions|auth=1 status=loading err="" public=0 gen=3 blocked=0:idle:"" needsAction=0 upcoming=[41] history=[] unread=0',
  'sign-in-other-account|mySessions|auth=1 status=ready err="" public=0 gen=3 blocked=0:idle:"" needsAction=0 upcoming=[41] history=[] unread=0',
  'sign-in-other-account|render|sessions=[] drawer=open userLoc=0 date=null band=all instant=0 types=[] districts=[] courts=[] map=warning:"地圖目前無法使用；你仍可瀏覽附近球局。" locMsg="無法取得位置；你仍可移動地圖或依球場尋找球局。"',
  "sign-in-other-account|pins|[]",
  'sign-in-other-account|players|on=0 status=idle msg="" groups=[]',
];

test("sessionController dispatches the frozen call sequence across the 17-step lifecycle script", async () => {
  const entries = await driveSequence();
  assert.deepEqual(entries, GOLDEN);
});

test("the recorded sequence covers every scripted step and is not an empty scan", async () => {
  const entries = await driveSequence();
  assert.ok(entries.length > 50, `expected more than 50 recorded entries, got ${entries.length}`);
  const steps = entries.filter((entry) => entry.endsWith("|step|--")).map((entry) => entry.split("|")[0]);
  assert.deepEqual(steps, [
    "setCourts",
    "initial-discovery",
    "bounds-change",
    "drawer",
    "filters",
    "sign-in",
    "courts-channel-with-open-form",
    "blocks",
    "player-layer-on",
    "player-layer-off",
    "gate-superseded",
    "discovery-error",
    "map-unavailable",
    "location-denied",
    "getters",
    "sign-out",
    "sign-in-other-account",
  ]);
  for (const step of steps) {
    const recorded = entries.filter((entry) => entry.startsWith(`${step}|`) && !entry.endsWith("|step|--"));
    assert.ok(recorded.length > 0, `step ${step} recorded no calls`);
  }
});
