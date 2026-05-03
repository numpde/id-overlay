export const ID_EMBED_SELECTOR = "#id-embed";
export const SURFACE_MOTION_SELECTOR = ".supersurface";
// TODO(smell): These selectors encode current iD/OpenStreetMap DOM structure.
// Keep upstream-DOM assumptions quarantined in this adapter layer and test any change.
export const VIEWPORT_SELECTORS = Object.freeze([
  ".main-map",
  ".supersurface",
  "#map",
  ".map-pane",
  ".maplibregl-canvas-container",
  ".leaflet-container",
]);

export function createWindowViewportRect(hashTarget) {
  return {
    left: 0,
    top: 0,
    width: hashTarget.innerWidth,
    height: hashTarget.innerHeight,
  };
}

export function createSurfaceMotion({
  transformCss = "none",
  transformOriginCss = "0px 0px",
} = {}) {
  return {
    transformCss,
    transformOriginCss,
  };
}

export function isSurfaceMotionActive(surfaceMotion) {
  return Boolean(
    surfaceMotion &&
    typeof surfaceMotion.transformCss === "string" &&
    surfaceMotion.transformCss !== "none",
  );
}

export function rectFromDomRect(rect) {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function translateRectByFrame(innerRect, frameElement) {
  const frameRect = frameElement.getBoundingClientRect();
  return {
    left: frameRect.left + innerRect.left,
    top: frameRect.top + innerRect.top,
    width: innerRect.width,
    height: innerRect.height,
  };
}

export function resolveMutationRoot(viewportDocument) {
  return viewportDocument.body ?? viewportDocument.documentElement ?? viewportDocument;
}

export function isOverlayOwnedElement(element) {
  return Boolean(
    element &&
    typeof element.closest === "function" &&
    element.closest("[data-id-overlay-owned=\"true\"]"),
  );
}

export function findEmbeddedIdFrame(viewportDocument) {
  const frame = viewportDocument.querySelector(ID_EMBED_SELECTOR);
  if (!frame) {
    return null;
  }
  try {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    const location = frameWindow?.location;
    if (
      !frameWindow ||
      !frameDocument ||
      location?.origin !== "https://www.openstreetmap.org" ||
      !location?.pathname?.startsWith("/id")
    ) {
      return null;
    }
    return frame;
  } catch {
    return null;
  }
}

export function findViewportElement(viewportDocument) {
  for (const selector of VIEWPORT_SELECTORS) {
    const candidate = viewportDocument.querySelector(selector);
    if (candidate && isVisible(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function findReferenceTile(viewportDocument) {
  // TODO(smell): Reference-tile discovery is heuristic and tile-layer specific.
  // Keep it out of projection math; replace it with an explicit map-view API when available.
  const centerTile = viewportDocument.querySelector("img.tile-center");
  if (centerTile) {
    return centerTile;
  }

  const tiles = [...viewportDocument.querySelectorAll("img.tile")]
    .filter(isVisible);
  if (!tiles.length) {
    return null;
  }

  tiles.sort((left, right) => areaOf(right) - areaOf(left));
  return tiles[0];
}

export function getSafeLocation(hashTarget) {
  try {
    return hashTarget.location ?? {
      origin: "",
      pathname: "",
      hash: "",
    };
  } catch {
    return {
      origin: "",
      pathname: "",
      hash: "",
    };
  }
}

export function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function areaOf(element) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}
