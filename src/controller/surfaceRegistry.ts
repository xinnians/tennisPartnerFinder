import type { SurfaceCloseOptions } from "../domainTypes.ts";

export interface SurfaceHandle {
  close?(options?: SurfaceCloseOptions): void;
}

interface SurfaceDefinition {
  close?(surface: unknown, options?: SurfaceCloseOptions): void;
  emptyOptionsByDefault?: boolean;
  metadata?: readonly string[];
  onRelease?(surface: unknown): void;
}

interface SurfaceOperation {
  action?: "close" | "release";
  expected?: unknown;
  name: string;
  options?: SurfaceCloseOptions;
  when?(registry: SurfaceRegistry): boolean;
}

export interface SurfaceRegistry {
  close(name: string, options?: SurfaceCloseOptions, expected?: unknown): boolean;
  get(name: string): unknown;
  is(name: string, expected: unknown): boolean;
  meta(name: string, key: string): unknown;
  release(name: string, expected?: unknown): unknown;
  set(name: string, handle: unknown, metadata?: Record<string, unknown>): unknown;
  transition(operations: readonly (string | SurfaceOperation)[] | undefined, options?: SurfaceCloseOptions): void;
  update(name: string, metadata: Record<string, unknown>): void;
}

type SurfaceEntry = { handle: unknown } & Record<string, unknown>;

/** Owns imperative surface handles and their transition metadata. */
export function createSurfaceRegistry(definitions: Record<string, SurfaceDefinition>): SurfaceRegistry {
  const entries: Record<string, SurfaceEntry> = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      Object.fromEntries([["handle", null], ...(definition.metadata ?? []).map((key) => [key, null])]),
    ])
  );

  function definitionFor(name: string): SurfaceDefinition {
    const definition = definitions[name];
    if (!definition) throw new Error(`Unknown surface: ${name}`);
    return definition;
  }

  function entryFor(name: string): SurfaceEntry {
    definitionFor(name);
    const entry = entries[name];
    if (!entry) throw new Error(`Unknown surface: ${name}`);
    return entry;
  }

  const registry: SurfaceRegistry = {
    close(name, options, expected = registry.get(name)) {
      const definition = definitionFor(name);
      const handle = registry.release(name, expected);
      if (!handle) return false;
      const closeOptions = options === undefined && definition.emptyOptionsByDefault !== false ? {} : options;
      if (definition.close) definition.close(handle, closeOptions);
      else if (typeof handle === "object" && handle !== null && "close" in handle) {
        (handle as SurfaceHandle).close?.(closeOptions);
      }
      return true;
    },
    get(name) {
      return entryFor(name).handle;
    },
    is(name, expected) {
      return Boolean(expected) && registry.get(name) === expected;
    },
    meta(name, key) {
      return entryFor(name)[key];
    },
    release(name, expected = registry.get(name)) {
      const definition = definitionFor(name);
      const entry = entryFor(name);
      if (!expected || entry.handle !== expected) return null;
      const handle = entry.handle;
      entry.handle = null;
      for (const key of definition.metadata ?? []) entry[key] = null;
      definition.onRelease?.(handle);
      return handle;
    },
    set(name, handle, metadata = {}) {
      const definition = definitionFor(name);
      const entry = entryFor(name);
      entry.handle = handle ?? null;
      for (const key of definition.metadata ?? []) {
        if (Object.hasOwn(metadata, key)) entry[key] = metadata[key] ?? null;
      }
      return entry.handle;
    },
    transition(operations, options) {
      for (const item of operations ?? []) {
        const operation: SurfaceOperation = typeof item === "string" ? { name: item } : item;
        if (operation.when && !operation.when(registry)) continue;
        const action = operation.action ?? "close";
        const expected = Object.hasOwn(operation, "expected") ? operation.expected : registry.get(operation.name);
        if (action === "release") registry.release(operation.name, expected);
        else
          registry.close(operation.name, Object.hasOwn(operation, "options") ? operation.options : options, expected);
      }
    },
    update(name, metadata) {
      const definition = definitionFor(name);
      const entry = entryFor(name);
      for (const key of definition.metadata ?? []) {
        if (Object.hasOwn(metadata, key)) entry[key] = metadata[key] ?? null;
      }
    },
  };
  return registry;
}
