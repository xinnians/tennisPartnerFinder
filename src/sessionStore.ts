import { useCallback, useSyncExternalStore } from "react";

import type { ControllerEventName, SessionControllerState } from "./controllerContracts.ts";
import { syncCommit } from "./syncCommit.ts";

// 極簡狀態容器:零依賴、單一狀態物件、具名通道訂閱。
//
// 為什麼派發是顯式的(emit)而不是寫入即通知:controller 的渲染契約要求同一組操作
// 下 renderer 收到的呼叫次序與次數逐次相同。多筆欄位常常要先一起寫完才通知一次,
// 也有「值沒變但仍要重畫」與「只通知某一面」的既有行為;寫入即通知會把這些合併或
// 放大成不同的呼叫序列。因此 setState 只負責寫,emit 才負責派發。

/** 一次寫入的內容:部分欄位,或依目前狀態算出部分欄位。 */
export type StorePatch<S> = Partial<S> | ((state: Readonly<S>) => Partial<S>);

/** 通道訂閱者;派發時收到當下的狀態快照。 */
export type StoreListener<S> = (state: Readonly<S>) => void;

export interface StoreChannelSnapshot<S> {
  state: Readonly<S>;
  version: number;
}

export interface Store<S extends object = SessionControllerState, Channel extends string = ControllerEventName> {
  /** 目前狀態快照。每次寫入都會換成新的頂層物件,呼叫端不可跨 await 快取。 */
  getState: () => Readonly<S>;
  /** 合併寫入指定欄位,回傳寫入後的快照;不派發任何通道。 */
  setState: (patch: StorePatch<S>) => Readonly<S>;
  /** 訂閱具名通道,回傳解除訂閱函式。 */
  subscribe: (channel: Channel, listener: StoreListener<S>) => () => void;
  /** React external-store snapshot；每次 emit 都換 identity，即使 state/value 沒變。 */
  getChannelSnapshot: (channel: Channel) => StoreChannelSnapshot<S>;
  /** 以目前快照同步派發指定通道的所有訂閱者,依訂閱順序逐一呼叫。 */
  emit: (channel: Channel) => void;
}

export function createStore<S extends object = SessionControllerState, Channel extends string = ControllerEventName>(
  initialState: S
): Store<S, Channel> {
  let state: Readonly<S> = { ...initialState };
  const channels = new Map<Channel, Set<StoreListener<S>>>();
  const snapshots = new Map<Channel, StoreChannelSnapshot<S>>();

  const getState = (): Readonly<S> => state;

  const setState = (patch: StorePatch<S>): Readonly<S> => {
    const nextPatch = typeof patch === "function" ? patch(state) : patch;
    state = Object.assign({}, state, nextPatch);
    return state;
  };

  const subscribe = (channel: Channel, listener: StoreListener<S>): (() => void) => {
    const listeners = channels.get(channel) ?? new Set<StoreListener<S>>();
    channels.set(channel, listeners);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getChannelSnapshot = (channel: Channel): StoreChannelSnapshot<S> => {
    const current = snapshots.get(channel);
    if (current) return current;
    const initial = { state, version: 0 };
    snapshots.set(channel, initial);
    return initial;
  };

  // 派發期間若有訂閱者增減,以派發當下的名單為準,避免同一次派發漏叫或重複叫。
  const emit = (channel: Channel): void => {
    const previous = getChannelSnapshot(channel);
    snapshots.set(channel, { state, version: previous.version + 1 });
    const listeners = channels.get(channel);
    if (!listeners) return;
    for (const listener of [...listeners]) listener(state);
  };

  return { emit, getChannelSnapshot, getState, setState, subscribe };
}

const NO_STORE_SNAPSHOT = Object.freeze({ state: null, version: 0 });

/**
 * 依具名通道訂閱 store，再由 selector 投影元件所需資料。Snapshot identity 由 emit
 * 世代保證，因此刻意就地變異的 filters 與「值沒變仍要重畫」都不依賴 value identity。
 */
export function useStoreSelector<S extends object, Channel extends string, Selected>(
  store: Store<S, Channel> | null | undefined,
  channel: Channel,
  selector: (state: Readonly<S>) => Selected,
  fallback: Selected,
  beforeStoreChange?: () => void
): Selected {
  const subscribe = useCallback(
    (listener: () => void) =>
      store
        ? store.subscribe(channel, () => {
            beforeStoreChange?.();
            // Public page adapters are synchronous from the e2e caller's
            // perspective. Preserve that contract when an external-store
            // emit happens inside one native event stack.
            syncCommit(listener);
          })
        : () => {},
    [beforeStoreChange, channel, store]
  );
  const getSnapshot = useCallback(
    () => (store ? store.getChannelSnapshot(channel) : NO_STORE_SNAPSHOT),
    [channel, store]
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return snapshot.state ? selector(snapshot.state) : fallback;
}
