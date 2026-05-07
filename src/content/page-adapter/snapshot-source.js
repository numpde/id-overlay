import {
  createFallbackPageSnapshot,
  createPageSnapshot,
  createStalePageSnapshot,
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
  // TODO(smell): Snapshot source owns subscription lifecycle, snapshot equality,
  // fallback recovery, and resolver orchestration. It is contained, but final
  // shape should split live observation from snapshot construction.
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
    const mapView = mapViewResolver.resolveMapView(context, {
      viewportRect: viewport.viewportRect,
      surfaceMotion,
    });
    return {
      viewportElement: viewport.viewportElement,
      mountElement: viewport.mountElement,
      viewportRect: viewport.viewportRect,
      localViewportRect: viewport.localViewportRect,
      viewportProvenance: viewport.viewportProvenance,
      mapView: mapView.mapView,
      mapViewProvenance: mapView.mapViewProvenance,
      surfaceMotion,
    };
  }

  function createFallbackSnapshot() {
    // TODO(smell): Boundary fallback now marks stale vs synthetic page facts,
    // but callers still mostly ignore provenance. Keep fallback construction
    // centralized here until degraded rendering/paste policy consumes it.
    if (lastSnapshot) {
      return createStalePageSnapshot(lastSnapshot);
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
