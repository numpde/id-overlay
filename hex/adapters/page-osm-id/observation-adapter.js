import {
  cssTransformIsIdentity,
} from "../shared/css-transform.js";

export function createPageSnapshotAdapter({ readPage, observeHistory = null }) {
  let lastCoherentMapView = null;

  return {
    readSnapshot() {
      const snapshot = snapshotFromPage(readPage(), lastCoherentMapView);
      if (snapshot.kind === "supported-map-page") {
        lastCoherentMapView = snapshot.mapView;
      }
      return snapshot;
    },
    subscribe(listener) {
      listener(this.readSnapshot());
      if (!observeHistory) {
        return () => {};
      }
      return observeHistory(() => {
        listener(this.readSnapshot());
      });
    },
  };
}

function snapshotFromPage(page, lastCoherentMapView) {
  if (page.embeddedEditorFrame) {
    return snapshotFromEmbeddedFrame({
      frame: page.embeddedEditorFrame,
      lastCoherentMapView,
    });
  }

  const retainedMapViewDuringMotion = retainedMapView(page, lastCoherentMapView);
  const preciseMapView = preciseMapViewFromRenderedTile(page);
  const hashMapView = parseMapView(page.hash);
  const mapView = retainedMapViewDuringMotion ?? preciseMapView ?? hashMapView;
  if (!mapView) {
    return {
      kind: "unavailable-map-snapshot",
      reason: "missing-map-view",
    };
  }

  return compactPlainObject({
    kind: "supported-map-page",
    mapView,
    viewportPx: page.viewport,
    viewportScreenPx: page.viewportScreenPx,
    tileTransform: validTileTransform(page.tileTransform),
    surfaceMotion: page.surfaceMotion,
    provenance: provenanceFor({ preciseMapView, retainedMapViewDuringMotion }),
  });
}

function snapshotFromEmbeddedFrame({
  frame,
  lastCoherentMapView,
}) {
  const retainedMapViewDuringMotion = retainedMapView(frame, lastCoherentMapView);
  const preciseMapView = preciseMapViewFromRenderedTile({
    centerTile: frame.centerTile,
    tileTransform: frame.tileTransform,
    viewport: frame.viewportRect,
  });
  const frameHashMapView = parseMapView(frame.hash);
  const effectiveMapView = retainedMapViewDuringMotion ?? preciseMapView ?? frameHashMapView;
  if (!effectiveMapView) {
    return {
      kind: "unavailable-map-snapshot",
      reason: "missing-map-view",
    };
  }
  return {
    kind: "supported-map-page",
    mapView: effectiveMapView,
    viewportPx: {
      width: frame.viewportRect.width,
      height: frame.viewportRect.height,
    },
    viewportScreenPx: {
      x: frame.frameRect.left + frame.viewportRect.left,
      y: frame.frameRect.top + frame.viewportRect.top,
    },
    surfaceMotion: frame.surfaceMotion,
    provenance: compactPlainObject({
      activeEditor: "embedded-id-frame",
      mapView: embeddedMapViewProvenance({
        retainedMapViewDuringMotion,
        preciseMapView,
        frameHashMapView,
      }),
    }),
  };
}

function embeddedMapViewProvenance({
  retainedMapViewDuringMotion,
  preciseMapView,
  frameHashMapView,
}) {
  if (retainedMapViewDuringMotion) {
    return {
      kind: "retained-during-surface-motion",
    };
  }
  if (preciseMapView) {
    return {
      kind: "precise-rendered-tile",
    };
  }
  if (frameHashMapView) {
    return {
      kind: "embedded-frame-hash",
    };
  }
  return undefined;
}

function retainedMapView(page, lastCoherentMapView) {
  if (!lastCoherentMapView || !isActiveSurfaceMotion(page.surfaceMotion)) {
    return null;
  }
  return lastCoherentMapView;
}

function provenanceFor({ preciseMapView, retainedMapViewDuringMotion }) {
  if (retainedMapViewDuringMotion) {
    return {
      mapView: {
        kind: "retained-during-surface-motion",
      },
    };
  }
  if (preciseMapView) {
    return {
      mapView: {
        kind: "precise-rendered-tile",
      },
    };
  }
  return undefined;
}

function preciseMapViewFromRenderedTile(page) {
  const tileTransform = validTileTransform(page.tileTransform);
  if (!page.centerTile || !tileTransform || !validViewport(page.viewport) || !validTilePx(page.centerTile.tilePx)) {
    return null;
  }
  const tile = parseTileUrl(page.centerTile.url);
  if (!tile) {
    return null;
  }
  const zoom = tile.z + Math.log2(tileTransform.scale);
  const zoomScale = 2 ** zoom;
  const tileTopLeftWorld = {
    x: tile.x * page.centerTile.tilePx.width / (2 ** tile.z),
    y: tile.y * page.centerTile.tilePx.height / (2 ** tile.z),
  };
  const centerWorld = {
    x: tileTopLeftWorld.x - (tileTransform.x - page.viewport.width / 2) / zoomScale,
    y: tileTopLeftWorld.y - (tileTransform.y - page.viewport.height / 2) / zoomScale,
  };
  const centerLatLon = latLonFromWorld(centerWorld);
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

function validTileTransform(tileTransform) {
  if (
    !Number.isFinite(tileTransform?.x)
      || !Number.isFinite(tileTransform?.y)
      || !Number.isFinite(tileTransform?.scale)
      || tileTransform.scale <= 0
  ) {
    return undefined;
  }
  return tileTransform;
}

function validViewport(viewport) {
  return Number.isFinite(viewport?.width)
    && Number.isFinite(viewport?.height)
    && viewport.width > 0
    && viewport.height > 0;
}

function validTilePx(tilePx) {
  return Number.isFinite(tilePx?.width)
    && Number.isFinite(tilePx?.height)
    && tilePx.width > 0
    && tilePx.height > 0;
}

function parseMapView(hash) {
  const match = /(?:^|[#&])map=(?<zoom>-?\d+(?:\.\d+)?)\/(?<lat>-?\d+(?:\.\d+)?)\/(?<lon>-?\d+(?:\.\d+)?)/u
    .exec(hash ?? "");
  if (!match) {
    return null;
  }
  return {
    zoom: Number(match.groups.zoom),
    centerLatLon: {
      lat: Number(match.groups.lat),
      lon: Number(match.groups.lon),
    },
  };
}

function parseTileUrl(url) {
  const zxyMatch = /\/(?<z>\d+)\/(?<x>\d+)\/(?<y>\d+)\.(?:png|jpe?g|webp)(?:$|\?)/iu.exec(url);
  if (zxyMatch) {
    return {
      z: Number(zxyMatch.groups.z),
      x: Number(zxyMatch.groups.x),
      y: Number(zxyMatch.groups.y),
    };
  }
  const quadkeyMatch = /\/a(?<quadkey>[0-3]+)\.(?:png|jpe?g|webp)(?:$|\?)/iu.exec(url);
  if (quadkeyMatch) {
    return tileFromQuadkey(quadkeyMatch.groups.quadkey);
  }
  return null;
}

function tileFromQuadkey(quadkey) {
  const z = quadkey.length;
  let x = 0;
  let y = 0;
  for (let index = 0; index < z; index += 1) {
    const mask = 1 << (z - index - 1);
    const digit = Number(quadkey[index]);
    if ((digit & 1) !== 0) {
      x |= mask;
    }
    if ((digit & 2) !== 0) {
      y |= mask;
    }
  }
  return {
    z,
    x,
    y,
  };
}

function latLonFromWorld({ x, y }) {
  const lon = x / 256 * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / 256;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat,
    lon,
  };
}

function isActiveSurfaceMotion(surfaceMotion) {
  return Boolean(
    surfaceMotion
      && surfaceMotion.transformCss
      && !cssTransformIsIdentity(surfaceMotion.transformCss),
  );
}

function compactPlainObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined));
}
