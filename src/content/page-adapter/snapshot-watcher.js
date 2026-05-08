const SNAPSHOT_POLL_INTERVAL_MS = 150;

export const PAGE_SNAPSHOT_OBSERVATION_CAUSE = Object.freeze({
  RESIZE: "resize",
  SCROLL: "scroll",
  HASH_CHANGE: "hash-change",
  POPSTATE: "popstate",
  POLL: "poll",
});

const WINDOW_OBSERVATION_EVENTS = Object.freeze([
  Object.freeze({
    type: "resize",
    cause: PAGE_SNAPSHOT_OBSERVATION_CAUSE.RESIZE,
  }),
  Object.freeze({
    type: "scroll",
    cause: PAGE_SNAPSHOT_OBSERVATION_CAUSE.SCROLL,
    options: Object.freeze({ passive: true }),
  }),
  Object.freeze({
    type: "hashchange",
    cause: PAGE_SNAPSHOT_OBSERVATION_CAUSE.HASH_CHANGE,
  }),
  Object.freeze({
    type: "popstate",
    cause: PAGE_SNAPSHOT_OBSERVATION_CAUSE.POPSTATE,
  }),
]);

export function createPageSnapshotWatcher({
  hashTarget,
  onChange,
}) {
  let isWatching = false;
  let snapshotLoopHandle = null;
  let usingAnimationFrameLoop = false;
  const windowObservationListeners = WINDOW_OBSERVATION_EVENTS.map((event) => ({
    ...event,
    listener: () => emit(event.cause),
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
        emit(PAGE_SNAPSHOT_OBSERVATION_CAUSE.POLL);
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
      () => emit(PAGE_SNAPSHOT_OBSERVATION_CAUSE.POLL),
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

  function emit(cause) {
    onChange({ cause });
  }

  return {
    start,
    stop,
  };
}
