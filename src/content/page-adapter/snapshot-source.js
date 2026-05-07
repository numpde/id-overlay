import {
  createFallbackPageSnapshot,
  createPageSnapshot,
  pageSnapshotsEqual,
} from "./page-snapshot.js";
import { createPageSnapshotWatcher } from "./snapshot-watcher.js";

export function createPageSnapshotSource({
  hashTarget,
  pageContext,
  viewportGeometry,
  mapViewResolver,
  runBoundary,
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
    listeners.add(listener);
    startWatching();
    runBoundary("subscribe-listener", () => {
      listener(getSnapshot());
    });
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        stopWatching();
      }
    };
  }

  function notifyIfChanged() {
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
    mapViewResolver.reset();
  }

  function readSnapshot() {
    return runBoundary("get-snapshot", () => {
      return createPageSnapshot(resolveSnapshotState(pageContext.getActiveMapContext()));
    }, createFallbackSnapshot());
  }

  function resolveSnapshotState(context) {
    const viewport = viewportGeometry.resolveViewportGeometry(context);
    const surfaceMotion = viewportGeometry.resolveSurfaceMotion(context);
    return {
      viewportElement: viewport.viewportElement,
      mountElement: viewport.mountElement,
      viewportRect: viewport.viewportRect,
      localViewportRect: viewport.localViewportRect,
      mapView: mapViewResolver.resolveMapView(context, {
        viewportRect: viewport.viewportRect,
        surfaceMotion,
      }),
      surfaceMotion,
    };
  }

  function createFallbackSnapshot() {
    if (lastSnapshot) {
      return lastSnapshot;
    }
    return createFallbackPageSnapshot({
      hashTarget,
      mapView: mapViewResolver.getFallbackMapView(),
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
