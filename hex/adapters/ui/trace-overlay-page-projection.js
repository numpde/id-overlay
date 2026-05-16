export function projectTraceOverlayForPageSnapshot({ overlay, pageSnapshot }) {
  if (!overlay.pageProjectionSource) {
    return overlay;
  }
  if (
    pageSnapshot?.kind !== "supported-map-page"
      || !hasProjectableMapView(pageSnapshot)
  ) {
    return unprojectableOverlay(overlay);
  }
  if (overlay.pageProjectionSource.kind === "map-locked-placement") {
    const mode = projectionMode(overlay);
    const placement = projectMapLockedPlacement({
      placement: overlay.placement,
      pageSnapshot,
    });
    return {
      ...overlay,
      viewport: viewportFromPageSnapshot({ overlay, pageSnapshot }),
      placement: localPlacementForViewport({ placement, pageSnapshot }),
      pins: mode === "trace" ? [] : overlay.pins,
      pageSurfaceMotion: pageSnapshot.surfaceMotion,
    };
  }
  const mode = projectionMode(overlay);
  const transform = overlay.pageProjectionSource.transform;
  const placement = {
    x: transform.tx,
    y: transform.ty,
    scale: transform.scale,
    rotationRad: transform.rotationRad,
  };
  return {
    ...overlay,
    viewport: viewportFromPageSnapshot({ overlay, pageSnapshot }),
    placement: localPlacementForViewport({
      placement: projectMapLockedPlacement({
        placement,
        pageSnapshot,
      }),
      pageSnapshot,
    }),
    pins: mode === "trace" ? [] : overlay.pins,
    pageSurfaceMotion: pageSnapshot.surfaceMotion,
  };
}

export const projectOverlayForPageSnapshot = projectTraceOverlayForPageSnapshot;

function unprojectableOverlay(overlay) {
  return {
    ...overlay,
    visible: false,
    placement: null,
    pins: [],
    pageProjectionFailure: {
      reason: "missing-projectable-map-view",
    },
  };
}

function hasProjectableMapView(pageSnapshot) {
  return Number.isFinite(pageSnapshot.mapView?.zoom)
    && Number.isFinite(pageSnapshot.mapView?.centerLatLon?.lat)
    && Number.isFinite(pageSnapshot.mapView?.centerLatLon?.lon)
    && Number.isFinite(pageSnapshot.viewportPx?.width)
    && Number.isFinite(pageSnapshot.viewportPx?.height);
}

function projectMapLockedPlacement({ placement, pageSnapshot }) {
  if (!placement) {
    return placement;
  }
  const centerWorld = projectLatLonToWorld(pageSnapshot.mapView.centerLatLon);
  const zoomScale = 2 ** pageSnapshot.mapView.zoom;
  const viewportCenter = {
    x: (pageSnapshot.viewportScreenPx?.x ?? 0) + pageSnapshot.viewportPx.width / 2,
    y: (pageSnapshot.viewportScreenPx?.y ?? 0) + pageSnapshot.viewportPx.height / 2,
  };
  return {
    x: viewportCenter.x + (placement.x - centerWorld.x) * zoomScale,
    y: viewportCenter.y + (placement.y - centerWorld.y) * zoomScale,
    scale: placement.scale * zoomScale,
    rotationRad: placement.rotationRad,
  };
}

function localPlacementForViewport({ placement, pageSnapshot }) {
  if (!placement) {
    return placement;
  }
  const viewportOrigin = viewportOriginFromPageSnapshot(pageSnapshot);
  return {
    ...placement,
    x: placement.x - viewportOrigin.x,
    y: placement.y - viewportOrigin.y,
  };
}

function viewportFromPageSnapshot({ overlay, pageSnapshot }) {
  const viewportOrigin = viewportOriginFromPageSnapshot(pageSnapshot);
  const mode = projectionMode(overlay);
  return {
    mode,
    isPassThrough: overlay.viewport?.isPassThrough ?? mode === "trace",
    rect: {
      left: viewportOrigin.x,
      top: viewportOrigin.y,
      width: pageSnapshot.viewportPx.width,
      height: pageSnapshot.viewportPx.height,
    },
  };
}

function projectionMode(overlay) {
  return overlay.pageProjectionSource?.mode ?? overlay.viewport?.mode ?? "trace";
}

function viewportOriginFromPageSnapshot(pageSnapshot) {
  return {
    x: pageSnapshot.viewportScreenPx?.x ?? 0,
    y: pageSnapshot.viewportScreenPx?.y ?? 0,
  };
}

function projectLatLonToWorld({ lat, lon }) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * 256,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * 256,
  };
}
