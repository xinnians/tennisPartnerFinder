import { createRoot, type Root } from "react-dom/client";

import { AppServicesProvider, type MeAppActions } from "../../src/app/AppServicesProvider.tsx";
import type { ControllerApi, ControllerIdentifier, SessionControllerState } from "../../src/controllerContracts.ts";
import type { CourtSummary, NotificationPreferences, Profile } from "../../src/domainTypes.ts";
import { MePage } from "../../src/pages/MePage.tsx";
import type { PageNotificationSettings, PageViewState, PageViewStore } from "../../src/pageViewStore.ts";
import { setMySessionActionScope, syncPendingMySessionActions } from "../../src/sessionActions.ts";
import { createStore } from "../../src/sessionStore.ts";
import { syncCommit } from "../../src/syncCommit.ts";

interface HarnessAuthSession {
  user?: {
    id?: string | null;
    identities?: Array<{ provider?: string | null }>;
    user_metadata?: { avatar_url?: string | null; picture?: string | null };
  };
}

interface MeAppHarnessOptions {
  authSession?: HarnessAuthSession | null;
  avatarUrl?: string;
  blockedPlayers?: SessionControllerState["blockedPlayers"];
  blockedPlayersError?: string;
  blockedPlayersStatus?: string;
  courts?: CourtSummary[] | null;
  lineProviderId?: string;
  linkedProviders?: string[] | null;
  notificationSettings?: PageNotificationSettings | null;
  onEditProfile?(): unknown;
  onEnablePush?(): unknown;
  onLinkProvider?(provider: string): unknown;
  onSaveCourtSubscriptions?(courtIds: number[]): unknown;
  onSaveNotificationPreferences?(preferences: NotificationPreferences): unknown;
  onSetOpenToGreeting?(enabled: boolean): unknown;
  onSetPresenceSharing?(enabled: boolean): unknown;
  onSignIn?(): unknown;
  onSignOut?(): unknown;
  onTogglePlayerVisibility?(): unknown;
  onUnblockPlayer?(profileId: ControllerIdentifier): unknown;
  playerVisibility?: boolean;
  presence?: {
    locationStatus?: string;
    openToGreeting?: boolean;
    sharePresence?: boolean;
  } | null;
  profile?: Partial<Profile> | null;
  supportHref?: string;
}

export interface MeAppHarness {
  pageViewStore: PageViewStore;
  root: Root;
  rootElement: HTMLElement;
  sessionStore: ControllerApi["sessionStore"];
  unmount(): void;
  update(options?: MeAppHarnessOptions): void;
}

const harnesses = new WeakMap<HTMLElement, MeAppHarness>();

function createMeHarnessState(options: MeAppHarnessOptions): SessionControllerState {
  const identities = options.linkedProviders?.map((provider) => ({ provider }));
  const userMetadata = options.avatarUrl ? { avatar_url: options.avatarUrl } : undefined;
  const suppliedSession = options.authSession === undefined ? { user: { id: "me-harness-user" } } : options.authSession;
  const authSession = suppliedSession
    ? {
        ...suppliedSession,
        user: {
          ...suppliedSession.user,
          identities: identities ?? suppliedSession.user?.identities,
          user_metadata: userMetadata ?? suppliedSession.user?.user_metadata,
        },
      }
    : null;
  return {
    authEpoch: 1,
    authSession,
    blockedPlayers: options.blockedPlayers ?? [],
    blockedPlayersError: options.blockedPlayersError ?? "",
    blockedPlayersStatus: (options.blockedPlayersStatus ?? "idle") as SessionControllerState["blockedPlayersStatus"],
    bounds: { east: 121.7, north: 25.2, south: 24.9, west: 121.4 },
    courts: options.courts ?? [],
    courtsReady: true,
    discoveryMessage: "",
    discoveryStatus: "idle",
    drawerState: "collapsed",
    filters: { band: "all", dateKey: null, districts: new Set(), instantOnly: false, types: new Set() },
    locationBlocked: false,
    locationMessage: "",
    mapUnavailable: false,
    mySessionRosters: new Map(),
    mySessions: [],
    mySessionsError: "",
    mySessionsStatus: "idle",
    playerLayerMessage: "",
    playerLayerOn: false,
    playerLayerStatus: "idle",
    players: [],
    profile:
      options.profile || options.presence
        ? {
            ...(options.profile ?? {}),
            openToGreeting: options.presence?.openToGreeting ?? options.profile?.openToGreeting,
            sharePresence: options.presence?.sharePresence ?? options.profile?.sharePresence,
          }
        : null,
    profileEligibility: {
      directory: options.playerVisibility ?? false,
      isPublic: options.playerVisibility ?? false,
      nickname: true,
      ntrp: true,
      status: "ready",
    },
    sessions: [],
    userLocation: null,
  };
}

function createMePageViewState(options: MeAppHarnessOptions): PageViewState {
  return {
    createdSessionFocusId: null,
    createdSessionFocusReason: null,
    notificationSettings: options.notificationSettings ?? {},
    presenceLocationStatus: options.presence?.locationStatus ?? "idle",
  };
}

function replaceAppOwnedRoot(rootElement: HTMLElement): HTMLElement {
  if (rootElement.id !== "me-root" || !rootElement.parentElement) return rootElement;
  const replacement = rootElement.cloneNode(false) as HTMLElement;
  rootElement.replaceWith(replacement);
  return replacement;
}

export function mountMeAppHarness(requestedRoot: HTMLElement, initialOptions: MeAppHarnessOptions = {}): MeAppHarness {
  const existing = harnesses.get(requestedRoot);
  if (existing) {
    existing.update(initialOptions);
    return existing;
  }

  const rootElement = replaceAppOwnedRoot(requestedRoot);
  let options = initialOptions;
  const sessionStore = createStore(createMeHarnessState(options));
  const pageViewStore = createStore<PageViewState, "me" | "mySessions">(createMePageViewState(options));
  const controller = {
    sessionStore,
    togglePlayerVisibility: () => options.onTogglePlayerVisibility?.(),
    unblockPlayer: (profileId: ControllerIdentifier) => options.onUnblockPlayer?.(profileId),
  } as unknown as ControllerApi;
  const meApp: MeAppActions = {
    get lineProviderId() {
      return options.lineProviderId ?? "";
    },
    onEditProfile: () => options.onEditProfile?.(),
    onEnablePush: () => options.onEnablePush?.(),
    onLinkProvider: (provider) => options.onLinkProvider?.(provider),
    onSaveCourtSubscriptions: (courtIds) => options.onSaveCourtSubscriptions?.(courtIds),
    onSaveNotificationPreferences: (preferences) => options.onSaveNotificationPreferences?.(preferences),
    onSetOpenToGreeting: (enabled) => options.onSetOpenToGreeting?.(enabled),
    onSetPresenceSharing: (enabled) => options.onSetPresenceSharing?.(enabled),
    onSignIn: () => options.onSignIn?.(),
    onSignOut: () => options.onSignOut?.(),
    get supportHref() {
      return options.supportHref ?? "";
    },
  };
  const root = createRoot(rootElement);

  const render = () => {
    syncCommit(() => {
      root.render(
        <AppServicesProvider controller={controller} meApp={meApp} pageViewStore={pageViewStore}>
          <MePage
            rootElement={rootElement}
            notificationSettings={options.notificationSettings ?? {}}
            presence={options.presence ?? {}}
            pageViewStore={pageViewStore}
            onStoreCommit={() => {
              setMySessionActionScope(rootElement, sessionStore.getState().authSession?.user?.id ?? null);
              syncPendingMySessionActions(rootElement);
            }}
          />
        </AppServicesProvider>
      );
    });
  };

  const harness: MeAppHarness = {
    pageViewStore,
    root,
    rootElement,
    sessionStore,
    unmount: () => root.unmount(),
    update(nextOptions = {}) {
      options = nextOptions;
      sessionStore.setState(createMeHarnessState(options));
      pageViewStore.setState(createMePageViewState(options));
      render();
      sessionStore.emit("me");
      pageViewStore.emit("me");
    },
  };
  harnesses.set(requestedRoot, harness);
  harnesses.set(rootElement, harness);
  render();
  return harness;
}

export function renderMeAppHarness(rootElement: HTMLElement, options: MeAppHarnessOptions = {}): MeAppHarness {
  return mountMeAppHarness(rootElement, options);
}
