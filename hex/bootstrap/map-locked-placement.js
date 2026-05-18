import {
  APPLICATION_MODE,
  APPLICATION_STATE_KEY,
  PAGE_SNAPSHOT_KIND,
  PAGE_SNAPSHOT_PROVENANCE_KIND,
  PLACEMENT_COORDINATE_SPACE,
} from "./application-state-vocabulary.js";

const STATE_KEY = APPLICATION_STATE_KEY;
const MODE = APPLICATION_MODE;

export function isLiveMapSnapshot(snapshot) {
  return snapshot?.kind === PAGE_SNAPSHOT_KIND.supportedMapPage
    && snapshot.provenance?.mapView?.kind !== PAGE_SNAPSHOT_PROVENANCE_KIND.retainedDuringSurfaceMotion;
}

export function isMapLockedMode(mode) {
  return mode === MODE.trace || mode === MODE.align;
}

export function tryNormalizeDurablePlacementCoordinateSpace({ durableState, snapshot }) {
  const current = durableState?.[STATE_KEY.session];
  const placement = current?.[STATE_KEY.placement];
  if (
    !current
      || current[STATE_KEY.mode] !== MODE.align
      || !placement
      || placement.coordinateSpace === PLACEMENT_COORDINATE_SPACE.mapWorld
  ) {
    return {
      status: "none",
    };
  }
  if (!isLiveMapSnapshot(snapshot)) {
    return {
      status: "none",
    };
  }
  if (
    placement.coordinateSpace !== PLACEMENT_COORDINATE_SPACE.screen
      && snapshot.provenance?.activeEditor !== "embedded-id-frame"
  ) {
    return {
      status: "none",
    };
  }
  return {
    status: "normalized",
    durableState: {
      [STATE_KEY.session]: {
        ...current,
        [STATE_KEY.placement]: deriveMapLockedPlacementFromScreenPlacement({
          placement,
          pageSnapshot: snapshot,
        }),
      },
    },
  };
}

export function deriveMapLockedPlacementFromScreenPlacement({ placement, pageSnapshot }) {
  const centerWorld = projectLatLonToWorld(pageSnapshot.mapView.centerLatLon);
  const zoomScale = 2 ** pageSnapshot.mapView.zoom;
  const viewportCenter = {
    x: (pageSnapshot.viewportScreenPx?.x ?? 0) + pageSnapshot.viewportPx.width / 2,
    y: (pageSnapshot.viewportScreenPx?.y ?? 0) + pageSnapshot.viewportPx.height / 2,
  };
  return {
    x: centerWorld.x + (placement.x - viewportCenter.x) / zoomScale,
    y: centerWorld.y + (placement.y - viewportCenter.y) / zoomScale,
    scale: placement.scale / zoomScale,
    rotationRad: placement.rotationRad,
    coordinateSpace: PLACEMENT_COORDINATE_SPACE.mapWorld,
  };
}

export function projectLatLonToWorld({ lat, lon }) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: 256 * ((lon + 180) / 360),
    y: 256 * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}

export function projectWorldToLatLon({ x, y }) {
  const lon = x / 256 * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / 256;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat,
    lon,
  };
}
