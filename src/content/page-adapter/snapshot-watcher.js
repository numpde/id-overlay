const SNAPSHOT_POLL_INTERVAL_MS = 150;

export function createPageSnapshotWatcher({
  hashTarget,
  pageContext,
  onChange,
}) {
  // TODO(smell): Watcher combines event listeners with RAF/interval polling.
  // Keep scheduling quarantined here; a final page-observation service should
  // expose the reason a snapshot was requested.
  let isWatching = false;
  let snapshotLoopHandle = null;
  let usingAnimationFrameLoop = false;

  function start() {
    if (isWatching) {
      return;
    }

    isWatching = true;
    hashTarget.addEventListener("resize", onChange);
    hashTarget.addEventListener("scroll", onChange, { passive: true });
    hashTarget.addEventListener("hashchange", onChange);
    hashTarget.addEventListener("popstate", onChange);
    pageContext.start();
    startSnapshotLoop();
  }

  function stop() {
    if (!isWatching) {
      return;
    }

    isWatching = false;
    stopSnapshotLoop();
    hashTarget.removeEventListener("resize", onChange);
    hashTarget.removeEventListener("scroll", onChange);
    hashTarget.removeEventListener("hashchange", onChange);
    hashTarget.removeEventListener("popstate", onChange);
    pageContext.destroy();
  }

  function startSnapshotLoop() {
    // TODO(smell): RAF polling is a brute-force bridge for live map animation.
    // If upstream map events become available, replace this loop instead of
    // teaching snapshot consumers about polling cadence.
    if (typeof hashTarget.requestAnimationFrame === "function") {
      usingAnimationFrameLoop = true;
      const tick = () => {
        if (!isWatching) {
          return;
        }
        onChange();
        if (!isWatching) {
          return;
        }
        snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      };
      snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      return;
    }

    usingAnimationFrameLoop = false;
    snapshotLoopHandle = hashTarget.setInterval(onChange, SNAPSHOT_POLL_INTERVAL_MS);
  }

  function stopSnapshotLoop() {
    if (snapshotLoopHandle === null) {
      return;
    }
    if (usingAnimationFrameLoop && typeof hashTarget.cancelAnimationFrame === "function") {
      hashTarget.cancelAnimationFrame(snapshotLoopHandle);
    } else {
      hashTarget.clearInterval(snapshotLoopHandle);
    }
    snapshotLoopHandle = null;
    usingAnimationFrameLoop = false;
  }

  return {
    start,
    stop,
  };
}
