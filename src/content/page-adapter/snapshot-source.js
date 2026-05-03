import {
  createSurfaceMotion,
  createWindowViewportRect,
} from "./dom.js";

export function createPageSnapshotSource({
  hashTarget,
  pageContext,
  viewportGeometry,
  mapViewResolver,
  runBoundary,
}) {
  // TODO(smell): Snapshot observation combines event listeners, RAF polling,
  // snapshot equality, and cache fallback. Keep page-context inference elsewhere;
  // next cleanup should split scheduler ownership from snapshot cache ownership.
  let snapshotLoopHandle = null;
  let usingAnimationFrameLoop = false;
  let lastSnapshot = null;
  const listeners = new Set();

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
    if (lastSnapshot && snapshotsEqual(lastSnapshot, nextSnapshot)) {
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
    if (snapshotLoopHandle) {
      return;
    }

    hashTarget.addEventListener("resize", notifyIfChanged);
    hashTarget.addEventListener("scroll", notifyIfChanged, { passive: true });
    hashTarget.addEventListener("hashchange", notifyIfChanged);
    hashTarget.addEventListener("popstate", notifyIfChanged);
    pageContext.start();
    startSnapshotLoop();
  }

  function stopWatching() {
    if (!snapshotLoopHandle) {
      return;
    }

    stopSnapshotLoop();
    hashTarget.removeEventListener("resize", notifyIfChanged);
    hashTarget.removeEventListener("scroll", notifyIfChanged);
    hashTarget.removeEventListener("hashchange", notifyIfChanged);
    hashTarget.removeEventListener("popstate", notifyIfChanged);
    pageContext.destroy();
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
      return createSnapshot(resolveSnapshotState(pageContext.getActiveMapContext()));
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
    const viewportRect = createWindowViewportRect(hashTarget);
    return createSnapshot({
      viewportElement: null,
      mountElement: null,
      viewportRect,
      localViewportRect: viewportRect,
      mapView: mapViewResolver.getFallbackMapView(),
      surfaceMotion: createSurfaceMotion(),
    });
  }

  function startSnapshotLoop() {
    if (typeof hashTarget.requestAnimationFrame === "function") {
      usingAnimationFrameLoop = true;
      const tick = () => {
        notifyIfChanged();
        snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      };
      snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      return;
    }

    usingAnimationFrameLoop = false;
    snapshotLoopHandle = hashTarget.setInterval(notifyIfChanged, 150);
  }

  function stopSnapshotLoop() {
    if (!snapshotLoopHandle) {
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
    getSnapshot,
    subscribe,
    destroy,
    notifyIfChanged,
    handleStructureMutation,
  };
}

function createSnapshot({
  viewportElement = null,
  mountElement = null,
  viewportRect,
  localViewportRect,
  mapView,
  surfaceMotion,
}) {
  return {
    viewportElement,
    mountElement,
    viewportRect,
    localViewportRect,
    mapView,
    surfaceMotion,
  };
}

function snapshotsEqual(left, right) {
  return (
    left.viewportElement === right.viewportElement &&
    left.mountElement === right.mountElement &&
    left.viewportRect.left === right.viewportRect.left &&
    left.viewportRect.top === right.viewportRect.top &&
    left.viewportRect.width === right.viewportRect.width &&
    left.viewportRect.height === right.viewportRect.height &&
    left.localViewportRect.left === right.localViewportRect.left &&
    left.localViewportRect.top === right.localViewportRect.top &&
    left.localViewportRect.width === right.localViewportRect.width &&
    left.localViewportRect.height === right.localViewportRect.height &&
    left.mapView.zoom === right.mapView.zoom &&
    left.mapView.center.lat === right.mapView.center.lat &&
    left.mapView.center.lon === right.mapView.center.lon &&
    left.surfaceMotion.transformCss === right.surfaceMotion.transformCss &&
    left.surfaceMotion.transformOriginCss === right.surfaceMotion.transformOriginCss
  );
}
