import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { BANDS } from "../filters.js";
import { NearbyDrawerFocusProvider } from "../nearbyDrawerFocus.ts";
import type { MePageOptions } from "../pages/MePage.tsx";
import { NearbySessionsDrawer } from "../pages/NearbySessionsDrawer.tsx";
import { syncCommit } from "../syncCommit.ts";
import { AppServicesProvider, type AppServices } from "./AppServicesProvider.tsx";
import {
  installSurfaceHostRenderer,
  mountSurfaceContent,
  SurfaceHost,
  type SurfaceContentLifecycle,
  type SurfaceHostSnapshot,
} from "./SurfaceHost.tsx";

interface PageSlot<Options> {
  id: number;
  onCommit?: () => void;
  options: Options;
  resetKey: number;
  rootElement: HTMLElement;
}

interface AppSnapshot {
  filters: FilterSnapshot;
  mePages: Map<HTMLElement, PageSlot<MePageOptions>>;
  navigation: NavigationSnapshot;
  surfaces: SurfaceHostSnapshot;
  toastMessage: string;
}

interface NavigationSnapshot {
  activePage: "map" | "me" | "messages" | "my-sessions";
  hasUnread: boolean;
  needsActionCount: number;
}

interface FilterSnapshot {
  band: string;
  dateKey: string | null;
  districts: Set<string>;
  instantOnly: boolean;
  types: Set<string>;
}

interface FilterToolbarHandlers {
  onOpenFilter(): void;
  onSetFilter(field: "band" | "dateKey" | "instantOnly", value: boolean | string | null): void;
}

interface LoginModalOptions {
  action?: string;
  lineProviderId?: string;
  onClose(): void;
  onProvider?(provider: string): Promise<unknown> | unknown;
}

interface AppProps {
  snapshot: AppSnapshot;
}

const noop = () => {};
let appRoot: Root | null = null;
let appServices: AppServices | null = null;
let mySessionsPortalRoot: HTMLElement | null = null;
let nearbyDrawerPortalRoot: HTMLElement | null = null;
let nextSlotId = 1;
let MePageComponent: typeof import("../pages/MePage.tsx").MePage | null = null;
let MessagesPageComponent: typeof import("../pages/MessagesPage.tsx").MessagesPage | null = null;
let MySessionsPageComponent: typeof import("../pages/MySessionsPage.tsx").MySessionsPage | null = null;
let mePageRequest: Promise<void> | null = null;
let messagesPageRequest: Promise<void> | null = null;
let mySessionsPageRequest: Promise<void> | null = null;
let mePageLoadFailed = false;
let messagesPageLoadFailed = false;
let mySessionsPageLoadFailed = false;
let snapshot: AppSnapshot = {
  filters: { band: "all", dateKey: null, districts: new Set(), instantOnly: false, types: new Set() },
  mePages: new Map(),
  navigation: { activePage: "map", hasUnread: false, needsActionCount: 0 },
  surfaces: new Map(),
  toastMessage: "",
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let filterToolbarHandlers: FilterToolbarHandlers = {
  onOpenFilter: noop,
  onSetFilter: noop,
};

function loadMePage(): Promise<void> {
  if (MePageComponent) return Promise.resolve();
  mePageRequest ??= import("../pages/MePage.tsx").then(
    ({ MePage }) => {
      MePageComponent = MePage;
      if (appRoot) renderApp();
    },
    (error) => {
      mePageLoadFailed = true;
      if (appRoot) renderApp();
      throw error;
    }
  );
  return mePageRequest;
}

function loadMessagesPage(): Promise<void> {
  if (MessagesPageComponent) return Promise.resolve();
  messagesPageRequest ??= import("../pages/MessagesPage.tsx").then(
    ({ MessagesPage }) => {
      MessagesPageComponent = MessagesPage;
      if (appRoot) renderApp();
    },
    (error) => {
      messagesPageLoadFailed = true;
      if (appRoot) renderApp();
      throw error;
    }
  );
  return messagesPageRequest;
}

function loadMySessionsPage(): Promise<void> {
  if (MySessionsPageComponent) return Promise.resolve();
  mySessionsPageRequest ??= import("../pages/MySessionsPage.tsx").then(
    ({ MySessionsPage }) => {
      MySessionsPageComponent = MySessionsPage;
      if (appRoot) renderApp();
    },
    (error) => {
      mySessionsPageLoadFailed = true;
      if (appRoot) renderApp();
      throw error;
    }
  );
  return mySessionsPageRequest;
}

export function preloadMePageInApp(): Promise<void> {
  return loadMePage();
}

export function preloadMessagesPageInApp(): Promise<void> {
  return loadMessagesPage();
}

export function preloadMySessionsPageInApp(): Promise<void> {
  return loadMySessionsPage();
}

function PageLoading({ label }: { label: string }) {
  return (
    <div className="page-lazy-status" role="status" aria-live="polite" aria-atomic="true">
      {label}
    </div>
  );
}

function renderPortals<Options>(
  slots: Map<HTMLElement, PageSlot<Options>>,
  render: (slot: PageSlot<Options>) => React.ReactNode,
  prefix: string
) {
  return [...slots.values()].map((slot) => createPortal(render(slot), slot.rootElement, `${prefix}:${slot.id}`));
}

const MeDestination = memo(function MeDestination({
  failed,
  loaded,
  slot,
}: {
  failed: boolean;
  loaded: boolean;
  slot: PageSlot<MePageOptions>;
}) {
  useEffect(() => {
    if (!loaded && !failed) void loadMePage().catch(() => {});
  }, [failed, loaded]);
  if (!MePageComponent) return <PageLoading label={failed ? "「我」載入失敗，請重新整理。" : "正在載入「我」…"} />;
  const { notificationSettings = {}, presence = {}, pageViewStore } = slot.options;

  return (
    <AppErrorBoundary resetKey={slot.resetKey} surface="me-page">
      <MePageComponent
        key={slot.id}
        rootElement={slot.rootElement}
        notificationSettings={notificationSettings}
        presence={presence}
        pageViewStore={pageViewStore}
        onStoreCommit={slot.onCommit}
      />
    </AppErrorBoundary>
  );
});

const MessagesDestination = memo(function MessagesDestination({
  failed,
  loaded,
}: {
  failed: boolean;
  loaded: boolean;
}) {
  useEffect(() => {
    if (!loaded && !failed) void loadMessagesPage().catch(() => {});
  }, [failed, loaded]);
  if (!MessagesPageComponent) return <PageLoading label={failed ? "訊息載入失敗，請重新整理。" : "正在載入訊息…"} />;
  return (
    <AppErrorBoundary resetKey={0} surface="messages-page">
      <MessagesPageComponent />
    </AppErrorBoundary>
  );
});

const MySessionsDestination = memo(function MySessionsDestination({
  failed,
  loaded,
  rootElement,
}: {
  failed: boolean;
  loaded: boolean;
  rootElement: HTMLElement;
}) {
  useEffect(() => {
    if (!loaded && !failed) void loadMySessionsPage().catch(() => {});
  }, [failed, loaded]);
  if (!MySessionsPageComponent) {
    return <PageLoading label={failed ? "我的球局載入失敗，請重新整理。" : "正在載入我的球局…"} />;
  }
  return (
    <AppErrorBoundary resetKey={0} surface="my-sessions-page">
      <MySessionsPageComponent rootElement={rootElement} />
    </AppErrorBoundary>
  );
});

const NearbyDrawerDestination = memo(function NearbyDrawerDestination({ rootElement }: { rootElement: HTMLElement }) {
  return (
    <NearbyDrawerFocusProvider rootElement={rootElement}>
      <AppErrorBoundary resetKey={0} surface="nearby-sessions-drawer">
        <NearbySessionsDrawer />
      </AppErrorBoundary>
    </NearbyDrawerFocusProvider>
  );
});

function FilterIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function MapTopbar({ filters }: { filters: FilterSnapshot }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const filterCount = filters.types.size + filters.districts.size;
  const bandLabel = BANDS.find((band) => band.key === filters.band)?.label ?? "全部";

  useEffect(() => {
    if (!popoverOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPopoverOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [popoverOpen]);

  return (
    <>
      <div className="map-topbar">
        <div className="map-topbar__row">
          <a className="app-brand" href="#tab-map" aria-label="球咖首頁">
            <span className="app-brand__dot" aria-hidden="true" />
            <span className="app-brand__name">球咖</span>
            <span className="app-brand__code" aria-hidden="true">
              TPE
            </span>
          </a>
          <div className="city-chip" aria-label="目前城市：台北市">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
            </svg>
            <span>台北市</span>
          </div>
          <button
            type="button"
            id="player-directory-open"
            data-testid="player-directory-open"
            className="topbar-icon-button"
            aria-label="球友名單"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9.5" cy="8" r="3.6" />
              <path d="M22 21v-1.8a4 4 0 0 0-3-3.85M16.2 4.3a3.6 3.6 0 0 1 0 7.1" />
            </svg>
          </button>
        </div>

        <section className="map-toolbar" aria-label="尋找球局篩選">
          {[
            ["today", "今天"],
            ["tomorrow", "明天"],
            ["weekend", "週末"],
          ].map(([key, label]) => {
            const selected = filters.dateKey === key;
            return (
              <button
                key={key}
                type="button"
                className={`chip${selected ? " is-selected" : ""}`}
                data-date-chip={key}
                aria-pressed={selected}
                onClick={() => filterToolbarHandlers.onSetFilter("dateKey", selected ? null : key)}
              >
                {label}
              </button>
            );
          })}
          <button
            type="button"
            id="level-chip"
            className={`chip level-chip${filters.band !== "all" ? " is-selected" : ""}`}
            aria-expanded={popoverOpen}
            aria-haspopup="true"
            aria-controls="level-popover"
            onClick={() => setPopoverOpen((open) => !open)}
          >
            <span>程度</span>
            <span id="band-label" className="level-chip__value">
              {bandLabel}
            </span>
            <svg
              className="level-chip__caret"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            id="instant-only-chip"
            className={`chip instant-chip${filters.instantOnly ? " is-selected" : ""}`}
            aria-pressed={filters.instantOnly}
            onClick={() => filterToolbarHandlers.onSetFilter("instantOnly", !filters.instantOnly)}
          >
            <span className="instant-chip__dot" aria-hidden="true" />
            <span>直接加入</span>
          </button>
          <button
            type="button"
            id="filter-sheet-open"
            className="chip filter-chip"
            aria-label={filterCount > 0 ? `篩選，已套用 ${filterCount} 組條件` : "篩選"}
            onClick={filterToolbarHandlers.onOpenFilter}
          >
            <FilterIcon />
            <span>篩選</span>
            {filterCount > 0 ? (
              <>
                {" "}
                <span className="filter-chip__badge">⋅{filterCount}</span>
              </>
            ) : null}
          </button>
        </section>
      </div>

      <div id="level-popover" className="level-popover" hidden={!popoverOpen}>
        <p>NTRP 程度篩選</p>
        <div id="band-options">
          {BANDS.map((band) => {
            const selected = band.key === filters.band;
            return (
              <button
                key={band.key}
                type="button"
                className={`band-option${selected ? " is-active" : ""}`}
                data-band={band.key}
                aria-pressed={selected}
                onClick={() => {
                  filterToolbarHandlers.onSetFilter("band", band.key);
                  setPopoverOpen(false);
                }}
              >
                <span>{band.label}</span>
                <svg
                  className="band-option__check"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-signal)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function NavigationIcon({ destination }: { destination: NavigationSnapshot["activePage"] }) {
  if (destination === "map") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.4" />
      </svg>
    );
  }
  if (destination === "my-sessions") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="5" width="16" height="16" rx="3" />
        <path d="M8 3v4M16 3v4M4 11h16" />
      </svg>
    );
  }
  if (destination === "messages") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z" />
      </svg>
    );
  }
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6.2 8-6.2s8 2.2 8 6.2" />
    </svg>
  );
}

function BottomNavigation({ navigation }: { navigation: NavigationSnapshot }) {
  const { activePage, hasUnread, needsActionCount } = navigation;
  return (
    <>
      <nav className="bottom-navigation" aria-label="主要導覽">
        <button
          type="button"
          id="map-tab"
          data-testid="map-tab"
          className="bottom-navigation__item"
          aria-controls="tab-map"
          aria-current={activePage === "map" ? "page" : undefined}
        >
          <span className="bottom-navigation__icon" aria-hidden="true">
            <NavigationIcon destination="map" />
          </span>
          <span>找球局</span>
        </button>
        <button
          type="button"
          id="my-sessions-tab"
          data-testid="my-sessions-tab"
          className="bottom-navigation__item"
          aria-controls="my-sessions-page"
          aria-current={activePage === "my-sessions" ? "page" : undefined}
          aria-label={`我的球局${needsActionCount > 0 ? `，${needsActionCount} 項待處理` : ""}`}
        >
          <span className="bottom-navigation__icon" aria-hidden="true">
            <NavigationIcon destination="my-sessions" />
            <span
              id="my-sessions-badge"
              className="my-sessions-badge"
              aria-hidden="true"
              hidden={needsActionCount <= 0}
            >
              {needsActionCount > 0 ? needsActionCount : null}
            </span>
          </span>
          <span>我的球局</span>
        </button>
        <button
          type="button"
          id="create-session-tab"
          data-testid="create-session-tab"
          className="bottom-navigation__create"
          aria-controls="sheet-root"
          aria-haspopup="dialog"
        >
          <span className="bottom-navigation__create-badge" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="bottom-navigation__create-label">開球局</span>
        </button>
        <button
          type="button"
          id="messages-tab"
          data-testid="messages-tab"
          className="bottom-navigation__item"
          aria-controls="messages-page"
          aria-current={activePage === "messages" ? "page" : undefined}
          aria-label={`訊息${hasUnread ? "，有未讀訊息" : ""}`}
        >
          <span className="bottom-navigation__icon" aria-hidden="true">
            <NavigationIcon destination="messages" />
            <span
              id="my-sessions-unread-dot"
              className="my-sessions-unread-dot"
              aria-hidden="true"
              hidden={!hasUnread}
            />
          </span>
          <span>訊息</span>
        </button>
        <button
          type="button"
          id="me-tab"
          data-testid="me-tab"
          className="bottom-navigation__item"
          aria-controls="me-page"
          aria-current={activePage === "me" ? "page" : undefined}
        >
          <span className="bottom-navigation__icon" aria-hidden="true">
            <NavigationIcon destination="me" />
          </span>
          <span>我</span>
        </button>
      </nav>
      <span
        id="my-sessions-badge-status"
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {needsActionCount > 0 ? `${needsActionCount} 項待處理` : "沒有待處理事項"}
      </span>
    </>
  );
}

const LOGIN_TITLES: Readonly<Record<string, string>> = {
  join: "登入以申請加入球局",
  create: "登入以開球局",
  players: "登入以查看在線球友",
  directory: "登入以查看球友名單",
  "my-sessions": "登入以查看你的球局",
  me: "登入以管理你的檔案與設定",
};

function LoginModalContent({ action = "", lineProviderId = "", onClose, onProvider }: LoginModalOptions) {
  const [message, setMessage] = useState("");
  const pendingProvider = useRef<string | null>(null);

  const startProvider = async (provider: string) => {
    if (pendingProvider.current) return;
    pendingProvider.current = provider;
    setMessage("");
    try {
      if (!onProvider) throw new TypeError("Login provider callback is unavailable.");
      await onProvider(provider);
      setMessage("正在前往登入頁…");
    } catch {
      pendingProvider.current = null;
      setMessage("登入啟動失敗，請稍後再試。");
    }
  };

  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">登入後繼續</p>
          <h2>{LOGIN_TITLES[action] ?? "登入以繼續"}</h2>
        </div>
        <button type="button" className="surface__close" data-surface-close="" aria-label="關閉" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="surface__copy">登入只用於繼續目前操作；已接受的球局成員可使用群組聊天。</p>
      {lineProviderId ? (
        <p className="surface__copy">
          Google 與 LINE 是各自獨立的帳號；登入後可在「我」頁把兩種登入方式連結成同一帳號。
        </p>
      ) : null}
      <p className="surface__message" data-login-message="" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <button
        type="button"
        className="session-primary"
        data-provider="google"
        disabled={pendingProvider.current === "google"}
        onClick={() => void startProvider("google")}
      >
        使用 Google 登入
      </button>
      {lineProviderId ? (
        <button
          type="button"
          className="session-primary"
          data-provider={lineProviderId}
          disabled={pendingProvider.current === lineProviderId}
          onClick={() => void startProvider(lineProviderId)}
        >
          使用 LINE 登入
        </button>
      ) : null}
    </>
  );
}

export function mountLoginModalContentInApp(
  rootElement: HTMLElement,
  options: LoginModalOptions
): SurfaceContentLifecycle {
  const surfaceContent = mountSurfaceContent(rootElement);
  surfaceContent.render(
    <AppErrorBoundary rootElement={rootElement} surface="login-dialog">
      <LoginModalContent {...options} />
    </AppErrorBoundary>
  );
  return surfaceContent;
}

/** One React tree; legacy page containers remain stable portal targets while sessionViews owns native listeners. */
export function App({ snapshot: current }: AppProps) {
  const messagesRoot = document.getElementById("messages-root");
  const toastRoot = document.getElementById("toast-root");
  const topbarRoot = document.getElementById("map-topbar-root");
  const navigationRoot = document.getElementById("bottom-navigation-root");
  return (
    <>
      {renderPortals(
        current.mePages,
        (slot) => (
          <MeDestination failed={mePageLoadFailed} loaded={Boolean(MePageComponent)} slot={slot} />
        ),
        "me"
      )}
      {messagesRoot
        ? createPortal(
            <MessagesDestination failed={messagesPageLoadFailed} loaded={Boolean(MessagesPageComponent)} />,
            messagesRoot,
            "messages"
          )
        : null}
      {mySessionsPortalRoot
        ? createPortal(
            <MySessionsDestination
              failed={mySessionsPageLoadFailed}
              loaded={Boolean(MySessionsPageComponent)}
              rootElement={mySessionsPortalRoot}
            />,
            mySessionsPortalRoot,
            "my-sessions"
          )
        : null}
      {nearbyDrawerPortalRoot
        ? createPortal(
            <NearbyDrawerDestination rootElement={nearbyDrawerPortalRoot} />,
            nearbyDrawerPortalRoot,
            "nearby"
          )
        : null}
      <SurfaceHost slots={current.surfaces} />
      {topbarRoot ? createPortal(<MapTopbar filters={current.filters} />, topbarRoot) : null}
      {navigationRoot ? createPortal(<BottomNavigation navigation={current.navigation} />, navigationRoot) : null}
      {toastRoot
        ? createPortal(
            current.toastMessage ? (
              <div className="toast">
                <svg className="toast__check" width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                  <path
                    d="M2.5 8l3.2 3.2L12.5 4"
                    fill="none"
                    stroke="var(--color-signal)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {current.toastMessage}
              </div>
            ) : null,
            toastRoot
          )
        : null}
    </>
  );
}

function ensureAppRoot(): Root {
  mySessionsPortalRoot ??= document.getElementById("my-sessions-root");
  nearbyDrawerPortalRoot ??= document.getElementById("nearby-sessions-drawer");
  if (appRoot) return appRoot;
  const host = document.createElement("div");
  host.id = "react-app-root";
  document.body.append(host);
  appRoot = createRoot(host);
  return appRoot;
}

function renderApp(): void {
  if (!appServices) throw new Error("App services must be configured before the React root renders.");
  ensureAppRoot().render(
    <AppServicesProvider {...appServices}>
      <App snapshot={snapshot} />
    </AppServicesProvider>
  );
}

export function configureAppServicesInApp(services: AppServices): void {
  if (appServices && appServices !== services) throw new Error("App services cannot be replaced after setup.");
  appServices = services;
}

/** Preserve main.js's fire-and-forget toast adapter while React owns its content and timer. */
export function showToastInApp(message: string): void {
  snapshot = { ...snapshot, toastMessage: message };
  renderApp();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastTimer = null;
    snapshot = { ...snapshot, toastMessage: "" };
    renderApp();
  }, 2000);
}

export function configureFilterToolbarInApp(handlers: FilterToolbarHandlers): void {
  filterToolbarHandlers = handlers;
}

export function syncFilterToolbarInApp(filters: FilterSnapshot): void {
  snapshot = { ...snapshot, filters };
  renderApp();
}

export function syncBottomNavigationInApp(navigation: NavigationSnapshot): void {
  snapshot = { ...snapshot, navigation };
  renderApp();
}

/**
 * sessionViews wires native listeners immediately after each public render call,
 * so this compatibility boundary must expose committed DOM before it returns.
 * Internal React updates do not use this path.
 */
function commitPageAdapterSynchronously(): void {
  syncCommit(renderApp);
}

function renderPage<Options>(
  key: keyof AppSnapshot,
  rootElement: HTMLElement,
  options: Options,
  onCommit?: () => void
): void {
  const slots = new Map(snapshot[key] as Map<HTMLElement, PageSlot<Options>>);
  const previous = slots.get(rootElement);
  slots.set(rootElement, {
    id: previous?.id ?? nextSlotId++,
    onCommit,
    options,
    // Page identity stays stable so React state and focus survive adapter
    // updates. Only the boundary observes this explicit recovery key.
    resetKey: (previous?.resetKey ?? 0) + 1,
    rootElement,
  });
  snapshot = { ...snapshot, [key]: slots };
  commitPageAdapterSynchronously();
}

export function renderMePageInApp(rootElement: HTMLElement, options: MePageOptions = {}, onCommit?: () => void): void {
  renderPage("mePages", rootElement, options, onCommit);
}

installSurfaceHostRenderer((surfaces) => {
  snapshot = { ...snapshot, surfaces };
  renderApp();
});
