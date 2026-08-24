import { flushSync as reactDomFlushSync } from "react-dom";

/**
 * Compatibility choke point for imperative adapters that must observe committed
 * React DOM before returning. Callers retain responsibility for deciding when a
 * synchronous commit is required; this leaf only centralizes the React DOM primitive.
 */
export function syncCommit(update: () => void): void {
  reactDomFlushSync(update);
}
