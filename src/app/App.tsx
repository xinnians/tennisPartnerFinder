import { memo } from "react";
import { createPortal } from "react-dom";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { MePage, type MePageOptions } from "../pages/MePage.tsx";
import { MessagesPage, type MessagesPageOptions } from "../pages/MessagesPage.tsx";
import { MySessionsPage, type MySessionsPageOptions } from "../pages/MySessionsPage.tsx";
import { NearbySessionsDrawer, type NearbySessionsDrawerOptions } from "../pages/NearbySessionsDrawer.tsx";

interface PageSlot<Options> {
  generation: number;
  id: number;
  options: Options;
  rootElement: HTMLElement;
}

interface AppSnapshot {
  mePages: Map<HTMLElement, PageSlot<MePageOptions>>;
  messagesPages: Map<HTMLElement, PageSlot<MessagesPageOptions>>;
  mySessionsPages: Map<HTMLElement, PageSlot<MySessionsPageOptions>>;
  nearbyDrawers: Map<HTMLElement, PageSlot<NearbySessionsDrawerOptions>>;
}

interface AppProps {
  snapshot: AppSnapshot;
}

const EMPTY_MESSAGES_GROUPS = { history: [], needsAction: [], needsActionCount: 0, upcoming: [] };
const noop = () => {};
let appRoot: Root | null = null;
let nextSlotId = 1;
let snapshot: AppSnapshot = {
  mePages: new Map(),
  messagesPages: new Map(),
  mySessionsPages: new Map(),
  nearbyDrawers: new Map(),
};

function renderPortals<Options>(
  slots: Map<HTMLElement, PageSlot<Options>>,
  render: (slot: PageSlot<Options>) => React.ReactNode,
  prefix: string
) {
  return [...slots.values()].map((slot) => createPortal(render(slot), slot.rootElement, `${prefix}:${slot.id}`));
}

const MeDestination = memo(function MeDestination({ slot }: { slot: PageSlot<MePageOptions> }) {
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
      <MePage
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

const MessagesDestination = memo(function MessagesDestination({ slot }: { slot: PageSlot<MessagesPageOptions> }) {
  const { courts = [], groups = EMPTY_MESSAGES_GROUPS, onOpenChat = noop } = slot.options;
  return (
    <AppErrorBoundary resetKey={slot.generation} surface="messages-page">
      <MessagesPage courts={courts} groups={groups} onOpenChat={onOpenChat} />
    </AppErrorBoundary>
  );
});

const MySessionsDestination = memo(function MySessionsDestination({ slot }: { slot: PageSlot<MySessionsPageOptions> }) {
  return (
    <AppErrorBoundary resetKey={slot.generation} surface="my-sessions-page">
      <MySessionsPage {...slot.options} key={slot.generation} rootElement={slot.rootElement} />
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

/** One React tree; legacy page containers remain stable portal targets until D4 removes their adapters. */
export function App({ snapshot: current }: AppProps) {
  return (
    <>
      {renderPortals(
        current.mePages,
        (slot) => (
          <MeDestination slot={slot} />
        ),
        "me"
      )}
      {renderPortals(
        current.messagesPages,
        (slot) => (
          <MessagesDestination slot={slot} />
        ),
        "messages"
      )}
      {renderPortals(
        current.mySessionsPages,
        (slot) => (
          <MySessionsDestination slot={slot} />
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

function renderPage<Options>(key: keyof AppSnapshot, rootElement: HTMLElement, options: Options): void {
  const slots = new Map(snapshot[key] as Map<HTMLElement, PageSlot<Options>>);
  const previous = slots.get(rootElement);
  slots.set(rootElement, {
    generation: (previous?.generation ?? 0) + 1,
    id: previous?.id ?? nextSlotId++,
    options,
    rootElement,
  });
  snapshot = { ...snapshot, [key]: slots };
  const root = ensureAppRoot();
  flushSync(() => root.render(<App snapshot={snapshot} />));
}

export function renderMePageInApp(rootElement: HTMLElement, options: MePageOptions = {}): void {
  renderPage("mePages", rootElement, options);
}

export function renderMessagesPageInApp(rootElement: HTMLElement, options: MessagesPageOptions = {}): void {
  renderPage("messagesPages", rootElement, options);
}

export function renderMySessionsPageInApp(rootElement: HTMLElement, options: MySessionsPageOptions = {}): void {
  renderPage("mySessionsPages", rootElement, options);
}

export function renderNearbySessionsDrawerInApp(
  rootElement: HTMLElement,
  options: NearbySessionsDrawerOptions = {}
): void {
  renderPage("nearbyDrawers", rootElement, options);
}
