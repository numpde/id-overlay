import {
  deriveMapLockedPlacementFromScreenPlacement,
  isLiveMapSnapshot,
  projectWorldToLatLon,
} from "./map-locked-placement.js";
import {
  PAGE_SNAPSHOT_KIND,
  PLACEMENT_COORDINATE_SPACE,
} from "./application-state-vocabulary.js";

export const BROWSER_SHELL_COMMAND_KIND = Object.freeze({
  CENTER_MAP_ON_OVERLAY: "center-map-on-overlay",
});

const CENTER_MAP_VIEW_PADDING_RATIO = 0.9;
const MIN_OSM_ZOOM = 0;
const MAX_OSM_ZOOM = 24;

export function isCenterMapOnOverlayCommand(command) {
  return command?.kind === BROWSER_SHELL_COMMAND_KIND.CENTER_MAP_ON_OVERLAY;
}

export function targetMapViewForOverlay({ overlay, pageSnapshot }) {
  const imageSize = overlay?.intrinsicSizePx;
  const placement = mapWorldPlacementForOverlay({
    placement: overlay?.placement,
    pageSnapshot,
  });
  const viewport = pageSnapshot?.viewportPx;
  if (
    !placement
      || !validImageSize(imageSize)
      || !validViewport(viewport)
      || !Number.isFinite(placement.scale)
      || placement.scale <= 0
  ) {
    return null;
  }

  const box = transformedWorldBox({
    imageSize,
    placement,
  });
  const centerLatLon = projectWorldToLatLon(box.center);
  const zoom = clamp(
    Math.log2(CENTER_MAP_VIEW_PADDING_RATIO * Math.min(
      viewport.width / box.width,
      viewport.height / box.height,
    )),
    MIN_OSM_ZOOM,
    MAX_OSM_ZOOM,
  );
  if (
    !Number.isFinite(zoom)
      || !Number.isFinite(centerLatLon.lat)
      || !Number.isFinite(centerLatLon.lon)
  ) {
    return null;
  }
  return {
    zoom,
    centerLatLon,
  };
}

function mapWorldPlacementForOverlay({ placement, pageSnapshot }) {
  if (!placement || pageSnapshot?.kind !== PAGE_SNAPSHOT_KIND.supportedMapPage) {
    return null;
  }
  if (placement.coordinateSpace === PLACEMENT_COORDINATE_SPACE.mapWorld) {
    return placement;
  }
  if (!isLiveMapSnapshot(pageSnapshot)) {
    return null;
  }
  return deriveMapLockedPlacementFromScreenPlacement({
    placement: screenPlacementForMapLock(placement),
    pageSnapshot,
  });
}

function screenPlacementForMapLock(placement) {
  if (placement.coordinateSpace === PLACEMENT_COORDINATE_SPACE.screen) {
    return placement;
  }
  const screenPlacement = {
    ...placement,
    coordinateSpace: PLACEMENT_COORDINATE_SPACE.screen,
  };
  return screenPlacement;
}

function transformedWorldBox({ imageSize, placement }) {
  const cos = Math.cos(placement.rotationRad);
  const sin = Math.sin(placement.rotationRad);
  const corners = [
    worldPointForImagePx({ imagePx: { x: 0, y: 0 }, placement, cos, sin }),
    worldPointForImagePx({ imagePx: { x: imageSize.width, y: 0 }, placement, cos, sin }),
    worldPointForImagePx({ imagePx: { x: 0, y: imageSize.height }, placement, cos, sin }),
    worldPointForImagePx({
      imagePx: {
        x: imageSize.width,
        y: imageSize.height,
      },
      placement,
      cos,
      sin,
    }),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    center: {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    },
    width: right - left,
    height: bottom - top,
  };
}

function worldPointForImagePx({
  imagePx,
  placement,
  cos,
  sin,
}) {
  const scaledX = imagePx.x * placement.scale;
  const scaledY = imagePx.y * placement.scale;
  return {
    x: placement.x + scaledX * cos - scaledY * sin,
    y: placement.y + scaledX * sin + scaledY * cos,
  };
}

function validImageSize(imageSize) {
  return Number.isFinite(imageSize?.width)
    && Number.isFinite(imageSize?.height)
    && imageSize.width > 0
    && imageSize.height > 0;
}

function validViewport(viewport) {
  return Number.isFinite(viewport?.width)
    && Number.isFinite(viewport?.height)
    && viewport.width > 0
    && viewport.height > 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
