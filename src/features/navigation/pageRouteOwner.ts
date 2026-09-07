export type AppPage = "map" | "me" | "messages" | "my-sessions";
export type PageHistoryMode = "none" | "push" | "replace";
export type PageFocusTarget = "notification-settings" | "page" | null;

interface RouteDefinition {
  collapseDrawer: boolean;
  elementId: string;
  focusSelector: string;
  hash: string;
  tabId: string;
}

interface PageRouteOwnerDependencies {
  collapseDrawer(): void;
  getAuthIdentity(): string | null;
  getHash(): string;
  getHistoryOwnerIdentity(): unknown;
  onEnter(page: AppPage): void;
  scheduleFocus(target: { preventScroll: boolean; selector: string }): void;
  setPageHidden(elementId: string, hidden: boolean): void;
  syncNavigation(page: AppPage): void;
  writeHistory(mode: Exclude<PageHistoryMode, "none">, state: { pageOwnerIdentity: string | null }, hash: string): void;
}

interface NavigateOptions {
  focusTarget?: PageFocusTarget;
  historyMode?: PageHistoryMode;
}

const APP_PAGES: readonly AppPage[] = ["map", "my-sessions", "messages", "me"];

const PAGE_ROUTES: Readonly<Record<AppPage, RouteDefinition>> = Object.freeze({
  map: {
    collapseDrawer: false,
    elementId: "tab-map",
    focusSelector: "#map-tab",
    hash: "#tab-map",
    tabId: "map-tab",
  },
  "my-sessions": {
    collapseDrawer: true,
    elementId: "my-sessions-page",
    focusSelector: "#my-sessions-root [data-my-sessions-heading]",
    hash: "#tab-my-sessions",
    tabId: "my-sessions-tab",
  },
  messages: {
    collapseDrawer: true,
    elementId: "messages-page",
    focusSelector: "#messages-root [data-messages-heading]",
    hash: "#tab-messages",
    tabId: "messages-tab",
  },
  me: {
    collapseDrawer: true,
    elementId: "me-page",
    focusSelector: "#me-root [data-me-heading]",
    hash: "#tab-me",
    tabId: "me-tab",
  },
});

function isAppPage(value: string): value is AppPage {
  return APP_PAGES.includes(value as AppPage);
}

export function pageFromHash(hash = ""): AppPage | null {
  return APP_PAGES.find((page) => PAGE_ROUTES[page].hash === hash) ?? null;
}

export function pageFromTabId(tabId = ""): AppPage | null {
  return APP_PAGES.find((page) => PAGE_ROUTES[page].tabId === tabId) ?? null;
}

export function createPageRouteOwner(dependencies: PageRouteOwnerDependencies) {
  let activePage: AppPage = "map";

  function navigate(
    pageCandidate: string,
    { focusTarget = null, historyMode = "push" }: NavigateOptions = {}
  ): boolean {
    if (!isAppPage(pageCandidate)) return false;
    const page = pageCandidate;
    const route = PAGE_ROUTES[page];
    if (route.collapseDrawer) dependencies.collapseDrawer();
    activePage = page;
    for (const candidate of APP_PAGES) {
      dependencies.setPageHidden(PAGE_ROUTES[candidate].elementId, candidate !== page);
    }
    dependencies.syncNavigation(page);
    if (historyMode !== "none" && dependencies.getHash() !== route.hash) {
      dependencies.writeHistory(historyMode, { pageOwnerIdentity: dependencies.getAuthIdentity() }, route.hash);
    }
    dependencies.onEnter(page);
    if (focusTarget) {
      const selector =
        focusTarget === "notification-settings" && page === "me"
          ? "#me-root [data-notification-settings-heading]"
          : route.focusSelector;
      dependencies.scheduleFocus({ preventScroll: focusTarget !== "notification-settings", selector });
    }
    return true;
  }

  function routeCurrentHash(): boolean {
    const hash = dependencies.getHash();
    const page = pageFromHash(hash) ?? (hash ? null : "map");
    return page ? navigate(page, { historyMode: "none" }) : false;
  }

  function reconcile({ forcePublic = false }: { forcePublic?: boolean } = {}): boolean {
    const page = pageFromHash(dependencies.getHash());
    if (!page) return false;
    const pageOwnerIdentity = dependencies.getHistoryOwnerIdentity();
    const mustLeavePrivatePage = forcePublic && page !== "map" && page !== "me";
    const changedPageOwner =
      !forcePublic && Boolean(pageOwnerIdentity) && pageOwnerIdentity !== dependencies.getAuthIdentity();
    return mustLeavePrivatePage || changedPageOwner ? navigate("map", { historyMode: "replace" }) : false;
  }

  return {
    getActivePage: () => activePage,
    navigate,
    pageFromTabId,
    reconcile,
    routeCurrentHash,
  };
}
