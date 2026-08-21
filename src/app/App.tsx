import { memo, useEffect, useLayoutEffect } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import type { MePageOptions } from "../pages/MePage.tsx";
import type { MessagesPageOptions } from "../pages/MessagesPage.tsx";
import type { MySessionsPageOptions } from "../pages/MySessionsPage.tsx";
import { NearbySessionsDrawer, type NearbySessionsDrawerOptions } from "../pages/NearbySessionsDrawer.tsx";
import { installSurfaceHostRenderer, SurfaceHost, type SurfaceHostSnapshot } from "./SurfaceHost.tsx";

interface PageSlot<Options> {
  generation: number;
  id: number;
  onCommit?: () => void;
  options: Options;
  rootElement: HTMLElement;
}

interface AppSnapshot {
  mePages: Map<HTMLElement, PageSlot<MePageOptions>>;
  messagesPages: Map<HTMLElement, PageSlot<MessagesPageOptions>>;
  mySessionsPages: Map<HTMLElement, PageSlot<MySessionsPageOptions>>;
  nearbyDrawers: Map<HTMLElement, PageSlot<NearbySessionsDrawerOptions>>;
  surfaces: SurfaceHostSnapshot;
}

interface AppProps {
  snapshot: AppSnapshot;
}

const EMPTY_MESSAGES_GROUPS = { history: [], needsAction: [], needsActionCount: 0, upcoming: [] };
const noop = () => {};
let appRoot: Root | null = null;
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
  mePages: new Map(),
  messagesPages: new Map(),
  mySessionsPages: new Map(),
  nearbyDrawers: new Map(),
  surfaces: new Map(),
};

function hasVisiblePageSlot(key: "mePages" | "messagesPages" | "mySessionsPages"): boolean {
  return [...snapshot[key].values()].some((slot) => !slot.rootElement.closest("[hidden]"));
}

function loadMePage(): Promise<void> {
  if (MePageComponent) return Promise.resolve();
  mePageRequest ??= import("../pages/MePage.tsx").then(
    ({ MePage }) => {
      MePageComponent = MePage;
      if (appRoot && hasVisiblePageSlot("mePages")) renderApp();
    },
    (error) => {
      mePageLoadFailed = true;
      if (appRoot && hasVisiblePageSlot("mePages")) renderApp();
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
      if (appRoot && hasVisiblePageSlot("messagesPages")) renderApp();
    },
    (error) => {
      messagesPageLoadFailed = true;
      if (appRoot && hasVisiblePageSlot("messagesPages")) renderApp();
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
      if (appRoot && hasVisiblePageSlot("mySessionsPages")) renderApp();
    },
    (error) => {
      mySessionsPageLoadFailed = true;
      if (appRoot && hasVisiblePageSlot("mySessionsPages")) renderApp();
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
  useLayoutEffect(() => {
    if (loaded) slot.onCommit?.();
  }, [loaded, slot]);
  if (!MePageComponent) return <PageLoading label={failed ? "「我」載入失敗，請重新整理。" : "正在載入「我」…"} />;
  const {
    authSession = null,
    profile = {},
    avatarUrl = "",
    blockedPlayers = [],
    blockedPlayersError = "",
    blockedPlayersStatus = "idle",
    courts = [],
    lineProviderId = "",
    linkedProviders = [],
    notificationSettings = {},
    onEditProfile = noop,
    onEnablePush = noop,
    onLinkProvider = noop,
    onSaveCourtSubscriptions = noop,
    onSaveNotificationPreferences = noop,
    onSetOpenToGreeting = noop,
    onSetPresenceSharing = noop,
    onSignIn = noop,
    onSignOut = noop,
    onTogglePlayerVisibility = noop,
    onUnblockPlayer = noop,
    playerVisibility = false,
    presence = {},
    supportHref = "",
  } = slot.options;

  return (
    <AppErrorBoundary resetKey={slot.generation} surface="me-page">
      <MePageComponent
        key={slot.generation}
        rootElement={slot.rootElement}
        authSession={authSession}
        profile={profile}
        avatarUrl={avatarUrl}
        blockedPlayers={blockedPlayers}
        blockedPlayersError={blockedPlayersError}
        blockedPlayersStatus={blockedPlayersStatus}
        courts={courts}
        lineProviderId={lineProviderId}
        linkedProviders={linkedProviders}
        notificationSettings={notificationSettings}
        onEditProfile={onEditProfile}
        onEnablePush={onEnablePush}
        onLinkProvider={onLinkProvider}
        onSaveCourtSubscriptions={onSaveCourtSubscriptions}
        onSaveNotificationPreferences={onSaveNotificationPreferences}
        onSetOpenToGreeting={onSetOpenToGreeting}
        onSetPresenceSharing={onSetPresenceSharing}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onTogglePlayerVisibility={onTogglePlayerVisibility}
        onUnblockPlayer={onUnblockPlayer}
        playerVisibility={playerVisibility}
        presence={presence}
        supportHref={supportHref}
      />
    </AppErrorBoundary>
  );
});

const MessagesDestination = memo(function MessagesDestination({
  failed,
  loaded,
  slot,
}: {
  failed: boolean;
  loaded: boolean;
  slot: PageSlot<MessagesPageOptions>;
}) {
  useEffect(() => {
    if (!loaded && !failed) void loadMessagesPage().catch(() => {});
  }, [failed, loaded]);
  useLayoutEffect(() => {
    if (loaded) slot.onCommit?.();
  }, [loaded, slot]);
  if (!MessagesPageComponent) return <PageLoading label={failed ? "訊息載入失敗，請重新整理。" : "正在載入訊息…"} />;
  const { courts = [], groups = EMPTY_MESSAGES_GROUPS, onOpenChat = noop } = slot.options;
  return (
    <AppErrorBoundary resetKey={slot.generation} surface="messages-page">
      <MessagesPageComponent courts={courts} groups={groups} onOpenChat={onOpenChat} />
    </AppErrorBoundary>
  );
});

const MySessionsDestination = memo(function MySessionsDestination({
  failed,
  loaded,
  slot,
}: {
  failed: boolean;
  loaded: boolean;
  slot: PageSlot<MySessionsPageOptions>;
}) {
  useEffect(() => {
    if (!loaded && !failed) void loadMySessionsPage().catch(() => {});
  }, [failed, loaded]);
  useLayoutEffect(() => {
    if (loaded) slot.onCommit?.();
  }, [loaded, slot]);
  if (!MySessionsPageComponent) {
    return <PageLoading label={failed ? "我的球局載入失敗，請重新整理。" : "正在載入我的球局…"} />;
  }
  return (
    <AppErrorBoundary resetKey={slot.generation} surface="my-sessions-page">
      <MySessionsPageComponent {...slot.options} key={slot.generation} rootElement={slot.rootElement} />
    </AppErrorBoundary>
  );
});

const NearbyDrawerDestination = memo(function NearbyDrawerDestination({
  slot,
}: {
  slot: PageSlot<NearbySessionsDrawerOptions>;
}) {
  return (
    <AppErrorBoundary resetKey={slot.generation} surface="nearby-sessions-drawer">
      <NearbySessionsDrawer {...slot.options} key={slot.generation} />
    </AppErrorBoundary>
  );
});

/** One React tree; legacy page containers remain stable portal targets while sessionViews owns native listeners. */
export function App({ snapshot: current }: AppProps) {
  return (
    <>
      {renderPortals(
        current.mePages,
        (slot) => (
          <MeDestination failed={mePageLoadFailed} loaded={Boolean(MePageComponent)} slot={slot} />
        ),
        "me"
      )}
      {renderPortals(
        current.messagesPages,
        (slot) => (
          <MessagesDestination failed={messagesPageLoadFailed} loaded={Boolean(MessagesPageComponent)} slot={slot} />
        ),
        "messages"
      )}
      {renderPortals(
        current.mySessionsPages,
        (slot) => (
          <MySessionsDestination
            failed={mySessionsPageLoadFailed}
            loaded={Boolean(MySessionsPageComponent)}
            slot={slot}
          />
        ),
        "my-sessions"
      )}
      {renderPortals(
        current.nearbyDrawers,
        (slot) => (
          <NearbyDrawerDestination slot={slot} />
        ),
        "nearby"
      )}
      <SurfaceHost slots={current.surfaces} />
    </>
  );
}

function ensureAppRoot(): Root {
  if (appRoot) return appRoot;
  const host = document.createElement("div");
  host.id = "react-app-root";
  document.body.append(host);
  appRoot = createRoot(host);
  return appRoot;
}

function renderApp(): void {
  ensureAppRoot().render(<App snapshot={snapshot} />);
}

/**
 * sessionViews wires native listeners immediately after each public render call,
 * so this compatibility boundary must expose committed DOM before it returns.
 * Internal React updates do not use this path.
 */
function commitPageAdapterSynchronously(): void {
  flushSync(renderApp);
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
    // sessionViews rebinds native listeners after every adapter call. Remounting
    // gives it fresh nodes and also resets a previously tripped error boundary.
    generation: (previous?.generation ?? 0) + 1,
    id: previous?.id ?? nextSlotId++,
    onCommit,
    options,
    rootElement,
  });
  snapshot = { ...snapshot, [key]: slots };
  commitPageAdapterSynchronously();
}

export function renderMePageInApp(rootElement: HTMLElement, options: MePageOptions = {}, onCommit?: () => void): void {
  renderPage("mePages", rootElement, options, onCommit);
}

export function renderMessagesPageInApp(
  rootElement: HTMLElement,
  options: MessagesPageOptions = {},
  onCommit?: () => void
): void {
  renderPage("messagesPages", rootElement, options, onCommit);
}

export function renderMySessionsPageInApp(
  rootElement: HTMLElement,
  options: MySessionsPageOptions = {},
  onCommit?: () => void
): void {
  renderPage("mySessionsPages", rootElement, options, onCommit);
}

export function renderNearbySessionsDrawerInApp(
  rootElement: HTMLElement,
  options: NearbySessionsDrawerOptions = {}
): void {
  renderPage("nearbyDrawers", rootElement, options);
}

installSurfaceHostRenderer((surfaces) => {
  snapshot = { ...snapshot, surfaces };
  renderApp();
});
