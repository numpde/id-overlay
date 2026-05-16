const HOST_PORT = Object.freeze({
  projectOverlayForPageSnapshot: "projectTraceOverlayForPageSnapshot",
});

export function createRenderProjectionLogger({ host }) {
  let lastSignature = "";
  return {
    log({
      pageSnapshot,
      baseView,
      projectedView,
    }) {
      const payload = {
        selectedViewMode: projectedView.mode,
        overlayInput: projectedView.overlayInput,
        snapshot: summarizePageSnapshot(pageSnapshot),
        before: summarizeOverlay(baseView.overlay),
        after: summarizeOverlay(projectedView.overlay),
      };
      const signature = JSON.stringify(payload);
      if (signature === lastSignature) {
        return;
      }
      lastSignature = signature;
      logDebug(host, "shell.render", "application-view", payload);
    },
  };
}

export function logPageSnapshotReceived({ host, snapshot }) {
  logDebug(host, "shell.page-snapshot", "received", {
    snapshot: summarizePageSnapshot(snapshot),
  });
}

export function projectApplicationView({ host, pageSnapshot, view }) {
  const projectOverlay = host[HOST_PORT.projectOverlayForPageSnapshot];
  if (!pageSnapshot || typeof projectOverlay !== "function") {
    logDebug(host, "shell.projection", "skipped", {
      reason: !pageSnapshot ? "missing-page-snapshot" : "missing-projector",
      overlay: summarizeOverlay(view.overlay),
    });
    return view;
  }
  const projectedOverlay = projectOverlay({
    overlay: view.overlay,
    pageSnapshot,
  });
  logDebug(host, "shell.projection", "projected", {
    snapshot: summarizePageSnapshot(pageSnapshot),
    before: summarizeOverlay(view.overlay),
    after: summarizeOverlay(projectedOverlay),
  });
  return {
    ...view,
    overlay: projectedOverlay,
  };
}

function logDebug(host, scope, event, payload = {}) {
  host.eventDebugLogger?.log?.(scope, event, payload);
}

function summarizePageSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }
  return {
    kind: snapshot.kind,
    reason: snapshot.reason,
    mapView: snapshot.mapView,
    viewportPx: snapshot.viewportPx,
    viewportScreenPx: snapshot.viewportScreenPx,
    tileTransform: snapshot.tileTransform,
    surfaceMotion: snapshot.surfaceMotion,
    provenance: snapshot.provenance,
  };
}

function summarizeOverlay(overlay) {
  if (!overlay) {
    return null;
  }
  return {
    visible: overlay.visible,
    viewport: overlay.viewport,
    overlayPlacement: overlay.placement,
    image: summarizePlacementBox(overlay.image),
    frame: summarizePlacementBox(overlay.frame),
    intrinsicSizePx: overlay.intrinsicSizePx,
    opacity: overlay.opacity,
    pageProjectionSource: summarizePageProjectionSource(overlay.pageProjectionSource),
    pageProjectionFailure: overlay.pageProjectionFailure,
    pageSurfaceMotion: overlay.pageSurfaceMotion,
    mapLayer: overlay.mapLayer,
    pinsCount: overlay.pins?.length,
    mapPinsCount: overlay.mapPins?.length,
  };
}

function summarizePlacementBox(box) {
  if (!box) {
    return null;
  }
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    opacity: box.opacity,
    transformCss: box.transformCss,
  };
}

function summarizePageProjectionSource(source) {
  if (!source) {
    return null;
  }
  return {
    kind: source.kind,
    projectionMode: source.mode,
    transform: source.transform,
  };
}
