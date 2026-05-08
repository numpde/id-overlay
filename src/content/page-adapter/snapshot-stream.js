import { pageSnapshotsEqual } from "./page-snapshot.js";

export function createPageSnapshotStream({
  readSnapshot,
  onFirstSubscriber,
  onNoSubscribers,
  notifyListener,
  snapshotsEqual = pageSnapshotsEqual,
}) {
  let lastSnapshot = null;
  let isDestroyed = false;
  const listeners = new Set();

  function getSnapshot() {
    if (isDestroyed) {
      return readSnapshot({ lastSnapshot: null });
    }
    return readSnapshot({ lastSnapshot });
  }

  function subscribe(listener) {
    if (isDestroyed) {
      return () => {};
    }
    listeners.add(listener);
    if (listeners.size === 1) {
      onFirstSubscriber();
    }
    notifyListener(listener, readAndRememberSnapshot());
    return () => {
      if (isDestroyed) {
        return;
      }
      listeners.delete(listener);
      if (!listeners.size) {
        reset();
        onNoSubscribers();
      }
    };
  }

  function notifyIfChanged() {
    if (isDestroyed) {
      return;
    }
    const nextSnapshot = readSnapshot({ lastSnapshot });
    if (lastSnapshot && snapshotsEqual(lastSnapshot, nextSnapshot)) {
      return;
    }
    lastSnapshot = nextSnapshot;
    for (const listener of listeners) {
      notifyListener(listener, nextSnapshot);
    }
  }

  function reset() {
    lastSnapshot = null;
  }

  function destroy() {
    isDestroyed = true;
    listeners.clear();
    reset();
  }

  function readAndRememberSnapshot() {
    const snapshot = readSnapshot({ lastSnapshot });
    lastSnapshot = snapshot;
    return snapshot;
  }

  return {
    getSnapshot,
    subscribe,
    notifyIfChanged,
    destroy,
  };
}
