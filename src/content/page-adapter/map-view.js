import {
  findReferenceTile,
  getSafeLocation,
  isSurfaceMotionActive,
} from "./dom.js";
import {
  unprojectWorldToLatLon,
} from "../../core/geometry.js";

const TILE_SIZE = 256;

export const DEFAULT_MAP_VIEW = Object.freeze({
  center: { lat: 0, lon: 0 },
  zoom: 2,
});

export function createMapViewResolver() {
  // TODO(smell): Map-view inference is currently tile/hash derived, not sourced
  // from a canonical iD map API. Keep this resolver isolated from projection callers.
  let lastCoherentMapView = null;

  function resolveMapView(context, { viewportRect, surfaceMotion }) {
    const preciseMapView = derivePreciseMapViewFromTiles({ context, viewportRect });
    if (preciseMapView) {
      lastCoherentMapView = preciseMapView;
      return preciseMapView;
    }
    if (isSurfaceMotionActive(surfaceMotion) && lastCoherentMapView) {
      return lastCoherentMapView;
    }
    const hashMapView = parseMapViewFromHash(getSafeLocation(context.mapWindow).hash);
    lastCoherentMapView = hashMapView;
    return hashMapView;
  }

  function getFallbackMapView() {
    return lastCoherentMapView ?? DEFAULT_MAP_VIEW;
  }

  function reset() {
    lastCoherentMapView = null;
  }

  return {
    resolveMapView,
    getFallbackMapView,
    reset,
  };
}

function derivePreciseMapViewFromTiles({ context, viewportRect }) {
  const tile = findReferenceTile(context.viewportDocument);
  if (!tile) {
    return null;
  }

  const tileCoordinates = parseTileCoordinates(tile.currentSrc || tile.src);
  if (!tileCoordinates) {
    return null;
  }

  const tileMatrix = parseMatrixTransform(tile);
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

function parseMapViewFromHash(hash) {
  // TODO(smell): Hash parsing is used as a map-view fallback, which can turn
  // URL state into placement/projection policy. The final page adapter should
  // expose whether map-view facts are precise, stale, or fallback-derived.
  const match = /map=([0-9]+(?:\.[0-9]+)?)\/(-?[0-9]+(?:\.[0-9]+)?)\/(-?[0-9]+(?:\.[0-9]+)?)/.exec(hash);
  if (!match) {
    return DEFAULT_MAP_VIEW;
  }

  const zoom = Number(match[1]);
  const lat = Number(match[2]);
  const lon = Number(match[3]);

  if (!Number.isFinite(zoom) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return DEFAULT_MAP_VIEW;
  }

  return {
    center: { lat, lon },
    zoom,
  };
}

function parseTileCoordinates(tileUrl) {
  if (typeof tileUrl !== "string" || !tileUrl) {
    return null;
  }

  const bingMatch = /\/tiles\/[a-z](\d+)\./i.exec(tileUrl);
  if (bingMatch) {
    return quadkeyToTileCoordinates(bingMatch[1]);
  }

  const xyzPathMatch = /\/(\d+)\/(\d+)\/(\d+)(?:\.[a-z0-9]+)(?:[?#]|$)/i.exec(tileUrl);
  if (xyzPathMatch) {
    return {
      zoom: Number(xyzPathMatch[1]),
      x: Number(xyzPathMatch[2]),
      y: Number(xyzPathMatch[3]),
    };
  }

  const xyzQueryMatch = /[?&](?:z|zoom)=(\d+).*?[?&](?:x|tilex)=(\d+).*?[?&](?:y|tiley)=(\d+)/i.exec(tileUrl);
  if (xyzQueryMatch) {
    return {
      zoom: Number(xyzQueryMatch[1]),
      x: Number(xyzQueryMatch[2]),
      y: Number(xyzQueryMatch[3]),
    };
  }

  return null;
}

function quadkeyToTileCoordinates(quadkey) {
  let x = 0;
  let y = 0;
  const zoom = quadkey.length;

  for (let index = 0; index < zoom; index += 1) {
    const bit = zoom - index - 1;
    const mask = 1 << bit;
    const digit = Number(quadkey[index]);
    if (digit & 1) {
      x |= mask;
    }
    if (digit & 2) {
      y |= mask;
    }
  }

  return { zoom, x, y };
}

function parseMatrixTransform(element) {
  const view = element.ownerDocument?.defaultView ?? globalThis;
  const style = typeof view.getComputedStyle === "function"
    ? view.getComputedStyle(element)
    : null;
  const transformCss = style?.transform ?? element.style.transform ?? "";
  const matrixMatch = /matrix\(([^)]+)\)/.exec(transformCss);
  if (matrixMatch) {
    const values = matrixMatch[1].split(",").map((value) => Number(value.trim()));
    if (values.length === 6 && values.every(Number.isFinite)) {
      const [a, b, _c, _d, tx, ty] = values;
      return {
        scale: Math.hypot(a, b),
        tx,
        ty,
      };
    }
  }

  return null;
}
