import { Fragment, useEffect, useLayoutEffect } from "react";

import { SessionCard } from "../components/SessionCard.tsx";
import type { ControllerEventName, SessionControllerState } from "../controllerContracts.ts";
import type { CourtSummary, SessionSummary } from "../domainTypes.ts";
import { isDefaultFilters, joinableSessionCount } from "../filters.js";
import { nearbySessionsDrawerRuntime, nearbySessionsSummaryText } from "../sessionPresentation.ts";
import { selectControllerMapView } from "../sessionSelectors.ts";
import { useStoreSelector, type Store } from "../sessionStore.ts";
import { taipeiClock } from "../taipeiTime.js";

type NearbySession = Partial<SessionSummary>;

interface NearbyCourt extends CourtSummary {
  district?: string;
}

interface DrawerFilters {
  band?: string;
  dateKey?: string | null;
  districts?: Set<string> | string[];
  instantOnly?: boolean;
  types?: Set<string> | string[];
}

interface DrawerMapStatus {
  kind?: string;
  message?: string;
}

export interface NearbySessionsDrawerOptions {
  courts?: NearbyCourt[];
  drawerState?: string;
  filters?: DrawerFilters | null;
  hasUserLocation?: boolean;
  mapStatus?: DrawerMapStatus | null;
  onExpandBounds?: () => unknown;
  onOpenCreate?: () => unknown;
  onOpenSession?: (sessionId?: string) => unknown;
  onReset?: () => unknown;
  onRetry?: () => unknown;
  onSubscribe?: () => unknown;
  onToggle?: (state: string) => unknown;
  rootElement?: HTMLElement;
  sessions?: NearbySession[];
  sessionStore?: Store<SessionControllerState, ControllerEventName>;
  onStoreCommit?: () => void;
  onBeforeStoreChange?: () => void;
}

interface DrawerSessionGroup {
  key: string;
  label: string;
  sessions: NearbySession[];
}

interface EmptyAction {
  className: string;
  id: string;
  label: string;
}

function PeekArrow() {
  return (
    <svg
      className="nearby-peek__arrow"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-signal)"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function SessionGroups({
  courts,
  onOpenSession,
  sessions,
}: {
  courts: NearbyCourt[];
  onOpenSession?: (sessionId?: string) => unknown;
  sessions: NearbySession[];
}) {
  const groups: DrawerSessionGroup[] = nearbySessionsDrawerRuntime.drawerSessionGroups(sessions);
  return groups.map((group) => (
    <Fragment key={group.key}>
      <div className="session-group">
        <span className="session-group__label">{group.label}</span>
        <span className="session-group__line" aria-hidden="true" />
        <span className="session-group__count">{group.sessions.length} 場</span>
      </div>
      {group.sessions.map((session, index) => (
        <SessionCard
          key={session.sessionId == null ? `${group.key}:${session.startAt}:${index}` : String(session.sessionId)}
          session={session}
          courts={courts}
          onOpenSession={onOpenSession}
        />
      ))}
    </Fragment>
  ));
}

function DiscoveryEmpty({
  filtersActive,
  onExpandBounds,
  onOpenCreate,
  onReset,
  onSubscribe,
}: {
  filtersActive: boolean;
  onExpandBounds?: () => unknown;
  onOpenCreate?: () => unknown;
  onReset?: () => unknown;
  onSubscribe?: () => unknown;
}) {
  const actions: EmptyAction[] = nearbySessionsDrawerRuntime.discoveryEmptyActions(filtersActive);
  return (
    <div id="discovery-empty" className="discovery-empty">
      <p>這個範圍暫時沒有可加入的球局</p>
      <div className="discovery-empty__actions">
        {actions.map((action) => (
          <button
            type="button"
            id={action.id}
            className={action.className}
            key={action.id}
            onClick={() => {
              if (action.id === "discovery-reset") onReset?.();
              else if (action.id === "discovery-expand") onExpandBounds?.();
              else if (action.id === "discovery-subscribe") onSubscribe?.();
              else if (action.id === "discovery-first") onOpenCreate?.();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DrawerContent({
  count,
  courts,
  error,
  filtersActive,
  loading,
  mapStatus,
  onExpandBounds,
  onOpenCreate,
  onOpenSession,
  onReset,
  onRetry,
  onSubscribe,
  sessions,
}: {
  count: number;
  courts: NearbyCourt[];
  error: boolean;
  filtersActive: boolean;
  loading: boolean;
  mapStatus: DrawerMapStatus;
  onExpandBounds?: () => unknown;
  onOpenCreate?: () => unknown;
  onOpenSession?: (sessionId?: string) => unknown;
  onReset?: () => unknown;
  onRetry?: () => unknown;
  onSubscribe?: () => unknown;
  sessions: NearbySession[];
}) {
  if (loading) {
    return (
      <div className="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true">
        <p>{mapStatus.message || "正在載入球局資料…"}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="nearby-sessions__status" role="alert">
        <p>{mapStatus.message || "球局資料暫時無法載入。"}</p>
        <button type="button" id="drawer-map-retry" className="session-secondary" onClick={() => onRetry?.()}>
          重新載入
        </button>
      </div>
    );
  }
  if (count) return <SessionGroups sessions={sessions} courts={courts} onOpenSession={onOpenSession} />;
  return (
    <DiscoveryEmpty
      filtersActive={filtersActive}
      onExpandBounds={onExpandBounds}
      onOpenCreate={onOpenCreate}
      onReset={onReset}
      onSubscribe={onSubscribe}
    />
  );
}

export function NearbySessionsDrawer(options: NearbySessionsDrawerOptions) {
  const subscribed = useStoreSelector(
    options.sessionStore,
    "map",
    selectControllerMapView,
    null,
    options.onBeforeStoreChange
  );
  const {
    courts = [],
    drawerState = "collapsed",
    filters = null,
    hasUserLocation = false,
    mapStatus = { kind: "idle", message: "" },
    sessions = [],
  } = subscribed ?? options;
  useLayoutEffect(() => {
    options.onStoreCommit?.();
  });
  const resolvedMapStatus = mapStatus ?? { kind: "idle", message: "" };
  const isOpen = drawerState === "open";
  const count = joinableSessionCount(sessions);
  const summary = nearbySessionsSummaryText(count, hasUserLocation);
  const filtersActive = !isDefaultFilters(filters);
  const loading = resolvedMapStatus.kind === "loading";
  const error = resolvedMapStatus.kind === "error";
  const collapse = () => {
    options.onToggle?.("collapsed");
    requestAnimationFrame(() => {
      const root = options.rootElement;
      const toggle = root?.querySelector<HTMLElement>("#nearby-sessions-toggle");
      const active = document.activeElement;
      const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
      if (!toggle || toggle.getAttribute("aria-expanded") !== "false" || hasNewSurface) return;
      const activeIsHiddenDrawerControl =
        active instanceof HTMLElement && Boolean(root?.contains(active)) && Boolean(active.closest("[hidden]"));
      if (
        active?.isConnected &&
        active !== document.body &&
        active !== document.documentElement &&
        !activeIsHiddenDrawerControl
      )
        return;
      toggle.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector("#sheet-root .surface, #modal-root .surface") || event.defaultPrevented) return;
      event.preventDefault();
      collapse();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  });
  useEffect(() => {
    const root = options.rootElement;
    if (!root) return;
    let pointerStart: number | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      pointerStart = event.clientY;
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (pointerStart == null) return;
      const delta = pointerStart - event.clientY;
      pointerStart = null;
      if (delta > 44 && !isOpen) options.onToggle?.("open");
      else if (delta < -44 && isOpen) collapse();
    };
    root.addEventListener("pointerdown", handlePointerDown);
    root.addEventListener("pointerup", handlePointerUp);
    return () => {
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerup", handlePointerUp);
    };
  });
  const first = sessions[0];
  const nextLabel = first
    ? `最近 ${nearbySessionsDrawerRuntime.taipeiDayWord(first.startAt)} ${taipeiClock(first.startAt)}`
    : "";

  return (
    <>
      {count || loading || error ? (
        <button
          type="button"
          id="nearby-sessions-toggle"
          className="nearby-peek"
          hidden={isOpen}
          aria-expanded={isOpen}
          aria-controls="nearby-sessions-list"
          onClick={() => options.onToggle?.(isOpen ? "collapsed" : "open")}
        >
          <span id="nearby-sessions-summary" className="visually-hidden">
            {summary}
          </span>
          <span className="nearby-peek__count" aria-hidden="true">
            {loading || error ? "…" : count}
          </span>
          <span className="nearby-peek__label" aria-hidden="true">
            {loading ? "載入中" : error ? "載入失敗" : "場可加入"}
          </span>
          {!loading && !error && nextLabel ? <span className="nearby-peek__next">{nextLabel}</span> : null}
          <PeekArrow />
        </button>
      ) : (
        <div className="nearby-peek nearby-peek--empty" hidden={isOpen}>
          <button
            type="button"
            id="nearby-sessions-toggle"
            className="nearby-peek__empty-toggle"
            aria-expanded={isOpen}
            aria-controls="nearby-sessions-list"
            onClick={() => options.onToggle?.(isOpen ? "collapsed" : "open")}
          >
            <span id="nearby-sessions-summary" className="visually-hidden">
              {summary}
            </span>
            <span aria-hidden="true">沒有符合的球局</span>
          </button>
          {filtersActive ? (
            <button type="button" id="peek-reset" className="nearby-peek__reset" onClick={() => options.onReset?.()}>
              重設篩選
            </button>
          ) : null}
          <button
            type="button"
            id="peek-create"
            className="nearby-peek__create"
            onClick={() => options.onOpenCreate?.()}
          >
            開一場
          </button>
        </div>
      )}
      <section
        id="nearby-sessions-list"
        className="nearby-drawer"
        hidden={!isOpen}
        data-drawer-state={drawerState}
        role="region"
        aria-label="附近球局"
      >
        <button
          type="button"
          className="nearby-drawer__handle"
          data-testid="drawer-collapse"
          aria-label="收合附近球局"
          onClick={collapse}
        >
          <span className="nearby-drawer__bar" aria-hidden="true" />
        </button>
        <div className="nearby-drawer__head">
          <div>
            <p className="nearby-drawer__eyebrow">NEARBY MATCHES</p>
            <div className="nearby-drawer__countrow">
              <span className="nearby-drawer__count">{loading || error ? "…" : count}</span>
              <span className="nearby-drawer__unit">場可加入</span>
            </div>
          </div>
          <button
            type="button"
            className="nearby-drawer__close"
            data-nearby-close=""
            aria-label="關閉附近球局"
            onClick={collapse}
          >
            ✕
          </button>
        </div>
        {isOpen && resolvedMapStatus.kind === "warning" && resolvedMapStatus.message ? (
          <div className="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true">
            <p>{resolvedMapStatus.message}</p>
          </div>
        ) : null}
        <div className="nearby-drawer__scroll">
          <div className="nearby-sessions__cards">
            <DrawerContent
              count={count}
              courts={courts}
              error={error}
              filtersActive={filtersActive}
              loading={loading}
              mapStatus={resolvedMapStatus}
              onExpandBounds={options.onExpandBounds}
              onOpenCreate={options.onOpenCreate}
              onOpenSession={options.onOpenSession}
              onReset={options.onReset}
              onRetry={options.onRetry}
              onSubscribe={options.onSubscribe}
              sessions={sessions}
            />
          </div>
        </div>
      </section>
    </>
  );
}
