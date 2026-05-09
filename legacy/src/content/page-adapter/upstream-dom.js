import { isVisible } from "./dom.js";

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

export function isOverlayOwnedElement(element) {
  // TODO(smell): Ownership is encoded as a DOM data attribute. Keep the marker
  // contract here so upstream hit-testing code never duplicates the selector.
  return Boolean(
    element &&
    typeof element.closest === "function" &&
    element.closest("[data-id-overlay-owned=\"true\"]"),
  );
}

export function findEmbeddedIdFrame(viewportDocument) {
  // TODO(smell): Embedded iD detection is based on OSM frame id and URL shape.
  // Replace with an explicit page capability if OSM exposes one.
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
  // TODO(smell): Viewport selection is an ordered heuristic. Keep the order here
  // as the single source of truth; callers should consume the resolved element,
  // never repeat selectors.
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

function areaOf(element) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}
