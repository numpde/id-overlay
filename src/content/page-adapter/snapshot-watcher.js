const SNAPSHOT_POLL_INTERVAL_MS = 150;

const WINDOW_OBSERVATION_EVENTS = Object.freeze([
  Object.freeze({
    type: "resize",
  }),
  Object.freeze({
    type: "scroll",
    options: Object.freeze({ passive: true }),
  }),
  Object.freeze({
    type: "hashchange",
  }),
  Object.freeze({
    type: "popstate",
  }),
]);

export function createPageSnapshotWatcher({
  hashTarget,
  onInvalidate,
}) {
  let isWatching = false;
  let snapshotLoopHandle = null;
  let usingAnimationFrameLoop = false;
  const windowObservationListeners = WINDOW_OBSERVATION_EVENTS.map((event) => ({
    ...event,
    listener: onInvalidate,
  }));

  function start() {
    if (isWatching) {
      return;
    }

    isWatching = true;
    for (const event of windowObservationListeners) {
      hashTarget.addEventListener(event.type, event.listener, event.options);
    }
    startSnapshotLoop();
  }

  function stop() {
    if (!isWatching) {
      return;
    }

    isWatching = false;
    stopSnapshotLoop();
    for (const event of windowObservationListeners) {
      hashTarget.removeEventListener(event.type, event.listener);
    }
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
        onInvalidate();
        if (!isWatching) {
          return;
        }
        snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      };
      snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      return;
    }

    usingAnimationFrameLoop = false;
    snapshotLoopHandle = hashTarget.setInterval(
      onInvalidate,
      SNAPSHOT_POLL_INTERVAL_MS,
    );
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
