import type { ControllerChatFeedFacade, ControllerChatFeedSnapshot } from "../../src/controllerContracts.ts";

function frozenSnapshot(
  previous: Readonly<ControllerChatFeedSnapshot> | null,
  patch: Partial<ControllerChatFeedSnapshot>
): Readonly<ControllerChatFeedSnapshot> {
  const messages = patch.messages ?? previous?.messages ?? [];
  const roster = patch.roster ?? previous?.roster ?? [];
  return Object.freeze({
    archived: patch.archived ?? previous?.archived ?? false,
    errorMessage: patch.errorMessage ?? previous?.errorMessage ?? "",
    messages: Object.freeze([...messages]),
    revision: (previous?.revision ?? -1) + 1,
    roster: Object.freeze([...roster]),
    status: patch.status ?? previous?.status ?? "loading",
  });
}

/** Browser-only state source for exercising the production Chat surface without a controller. */
export function createChatFeedHarness(initial: Partial<ControllerChatFeedSnapshot> = {}) {
  const listeners = new Set<() => void>();
  let snapshot = frozenSnapshot(null, initial);
  const publish = (patch: Partial<ControllerChatFeedSnapshot>): void => {
    snapshot = frozenSnapshot(snapshot, patch);
    for (const listener of listeners) listener();
  };
  const feed: ControllerChatFeedFacade = {
    archive: () => publish({ archived: true }),
    getSnapshot: () => snapshot,
    refresh: async () => false,
    start: () => {},
    stop: () => {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { feed, publish };
}
