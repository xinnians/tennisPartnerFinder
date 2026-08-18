export function createRequestGate() {
  let generation = 0;

  function capture(isCurrent = () => true) {
    const capturedGeneration = generation;
    return {
      isStale: () => capturedGeneration !== generation || !isCurrent(),
    };
  }

  return {
    capture,
    invalidate() {
      generation += 1;
    },
    issue(isCurrent) {
      generation += 1;
      return capture(isCurrent);
    },
  };
}

export function createForegroundPoller({
  intervalMs,
  isActive = () => true,
  onInterval,
  onVisible = onInterval,
  visibilityTarget = globalThis.document,
}) {
  let stopped = false;
  let timer = null;

  const canRun = () => !stopped && isActive();
  const onVisibilityChange = () => {
    if (visibilityTarget?.visibilityState === "visible" && canRun()) onVisible?.();
  };

  visibilityTarget?.addEventListener?.("visibilitychange", onVisibilityChange);
  if (intervalMs > 0) {
    timer = setInterval(() => {
      if (visibilityTarget?.visibilityState !== "hidden" && canRun()) onInterval?.();
    }, intervalMs);
    timer?.unref?.();
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      visibilityTarget?.removeEventListener?.("visibilitychange", onVisibilityChange);
      if (timer != null) clearInterval(timer);
      timer = null;
    },
  };
}
