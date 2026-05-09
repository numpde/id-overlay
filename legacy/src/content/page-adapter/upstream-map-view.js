import {
  unprojectWorldToLatLon,
} from "../../core/geometry.js";
import { parseTileMatrixTransform } from "./map-tile-transform.js";
import { parseTileCoordinates } from "./map-tile-url.js";
import { findReferenceTile } from "./upstream-dom.js";

const TILE_SIZE = 256;

export const DEFAULT_MAP_VIEW = Object.freeze({
  center: { lat: 0, lon: 0 },
  zoom: 2,
});

export { deriveHashMapView } from "./map-hash-view.js";

export function deriveTileMapView({ viewportDocument, viewportRect }) {
  // TODO(smell): Tile-derived map view is an inference from rendered imagery,
  // not a canonical map API. Keep every tile parsing assumption in this upstream
  // adapter module so projection never depends on tile DOM directly.
  const tile = findReferenceTile(viewportDocument);
  if (!tile) {
    return null;
  }

  const tileCoordinates = parseTileCoordinates(tile.currentSrc || tile.src);
  if (!tileCoordinates) {
    return null;
  }

  const tileMatrix = parseTileMatrixTransform(tile);
  if (!tileMatrix) {
    return null;
  }

  if (!Number.isFinite(tileMatrix.scale) || tileMatrix.scale <= 0) {
    return null;
  }

  const effectiveZoom = tileCoordinates.zoom + Math.log2(tileMatrix.scale);
  if (!Number.isFinite(effectiveZoom)) {
    return null;
  }

  const zoomScale = 2 ** effectiveZoom;
  const tileWorld = {
    x: (tileCoordinates.x * TILE_SIZE) / (2 ** tileCoordinates.zoom),
    y: (tileCoordinates.y * TILE_SIZE) / (2 ** tileCoordinates.zoom),
  };
  const viewportLocalCenter = {
    x: viewportRect.width / 2,
    y: viewportRect.height / 2,
  };
  const centerWorld = {
    x: tileWorld.x - (tileMatrix.tx - viewportLocalCenter.x) / zoomScale,
    y: tileWorld.y - (tileMatrix.ty - viewportLocalCenter.y) / zoomScale,
  };

  return {
    center: unprojectWorldToLatLon(centerWorld),
    zoom: effectiveZoom,
  };
}
