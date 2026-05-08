import { pageSnapshotsEqual } from "./page-snapshot.js";
import { createPageSnapshotReader } from "./snapshot-reader.js";
import { createPageSnapshotWatcher } from "./snapshot-watcher.js";

export function createPageSnapshotSource({
  hashTarget,
  pageContext,
  viewportGeometry,
  mapViewResolver,
  runBoundary,
  snapshotReader = createPageSnapshotReader({
    hashTarget,
    pageContext,
    viewportGeometry,
    mapViewResolver,
    runBoundary,
  }),
}) {
  let lastSnapshot = null;
  const listeners = new Set();
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    pageContext,
    onChange: notifyIfChanged,
  });

  function getSnapshot() {
    return readSnapshot();
  }

  function subscribe(listener) {
    // TODO(smell): First subscriber starts page watching and last unsubscribe
    // resets map-view cache. That coupling is subtle; prefer an explicit
    // page-observation lifecycle service if observation modes grow.
    listeners.add(listener);
    startWatching();
    runBoundary("subscribe-listener", () => {
      const initialSnapshot = readSnapshot();
      lastSnapshot = initialSnapshot;
      listener(initialSnapshot);
    });
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        stopWatching();
      }
    };
  }

  function notifyIfChanged() {
    // TODO(smell): Retargeting page context before every snapshot notification
    // is correct but implicit. The final watcher should emit retarget facts that
    // snapshot construction consumes explicitly.
    pageContext.syncObservedContext();
    const nextSnapshot = readSnapshot();
    if (lastSnapshot && pageSnapshotsEqual(lastSnapshot, nextSnapshot)) {
      return;
    }
    lastSnapshot = nextSnapshot;
    for (const listener of listeners) {
      runBoundary("notify-listener", () => {
        listener(nextSnapshot);
      });
    }
  }

  function handleStructureMutation() {
    viewportGeometry.refreshViewportElement();
    notifyIfChanged();
  }

  function startWatching() {
    watcher.start();
  }

  function stopWatching() {
    watcher.stop();
    lastSnapshot = null;
    mapViewResolver.reset();
  }

  function destroy() {
    stopWatching();
    listeners.clear();
    viewportGeometry.destroy();
  }

  function readSnapshot() {
    return snapshotReader.readSnapshot({
      lastSnapshot,
    });
  }

  return {
    getSnapshot,
    subscribe,
    destroy,
    notifyIfChanged,
    handleStructureMutation,
  };
}
