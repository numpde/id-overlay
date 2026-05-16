export function readOpenStreetMapPage({
  document,
  ownerWindow,
  location,
  pageWorldSurfaceMotion = null,
}) {
  const embeddedFrame = findEmbeddedEditorFrame(document);
  if (embeddedFrame) {
    return {
      hash: location?.hash ?? "",
      embeddedEditorFrame: readEmbeddedEditorFrame(embeddedFrame),
    };
  }

  const viewportElement = findViewportElement(document);
  const viewportRect = viewportElement?.getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    width: ownerWindow.innerWidth ?? 0,
    height: ownerWindow.innerHeight ?? 0,
  };
  return {
    hash: location?.hash ?? "",
    viewport: {
      width: viewportRect.width,
      height: viewportRect.height,
    },
    ...readRenderedTileFacts(document),
    viewportScreenPx: {
      x: viewportRect.left,
      y: viewportRect.top,
    },
    surfaceMotion: readSurfaceMotion({
      document,
      ownerWindow,
      pageWorldSurfaceMotion,
    }),
  };
}

export function readEmbeddedEditorFrame(frame) {
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  const viewportElement = findViewportElement(frameDocument);
  const viewportRect = viewportElement?.getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    width: frameWindow?.innerWidth ?? 0,
    height: frameWindow?.innerHeight ?? 0,
  };
  return {
    frameRect: frame.getBoundingClientRect(),
    hash: frameWindow?.location?.hash ?? "",
    viewportRect,
    ...readRenderedTileFacts(frameDocument),
    surfaceMotion: readSurfaceMotion({
      document: frameDocument,
      ownerWindow: frameWindow,
    }),
  };
}

export function summarizeObservedPage(page) {
  if (page?.embeddedEditorFrame) {
    const frame = page.embeddedEditorFrame;
    return {
      activeEditor: "embedded-id-frame",
      hostHash: page.hash,
      frameHash: frame.hash,
      frameRect: rectSummary(frame.frameRect),
      viewportRect: rectSummary(frame.viewportRect),
      tileTransform: frame.tileTransform,
      surfaceMotion: frame.surfaceMotion,
      centerTileUrl: frame.centerTile?.url,
    };
  }
  return {
    activeEditor: "top-level-map-page",
    hash: page?.hash,
    viewport: page?.viewport,
    viewportScreenPx: page?.viewportScreenPx,
    tileTransform: page?.tileTransform,
    surfaceMotion: page?.surfaceMotion,
    centerTileUrl: page?.centerTile?.url,
  };
}

export function findEmbeddedEditorFrame(document) {
  const frame = document.querySelector("#id-embed");
  if (!frame) {
    return null;
  }
  try {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    const frameLocation = frameWindow?.location;
    if (
      !frameWindow
        || !frameDocument
        || frameLocation?.origin !== "https://www.openstreetmap.org"
        || !frameLocation?.pathname?.startsWith("/id")
    ) {
      return null;
    }
    return frame;
  } catch {
    return null;
  }
}

export function findViewportElement(document) {
  for (const selector of [
    ".main-map",
    ".supersurface",
    "#map",
    ".map-pane",
    ".maplibregl-canvas-container",
    ".leaflet-container",
  ]) {
    const candidate = document.querySelector(selector);
    const rect = candidate?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      return candidate;
    }
  }
  return null;
}

export function readSurfaceMotion({
  document,
  ownerWindow,
  pageWorldSurfaceMotion = null,
}) {
  if (pageWorldSurfaceMotion && document === ownerWindow.document) {
    return pageWorldSurfaceMotion;
  }
  const directSurfaceMotion = readDirectSurfaceMotion({
    document,
    ownerWindow,
  });
  if (directSurfaceMotion && !isIdentityTransformCss(directSurfaceMotion.transformCss)) {
    return directSurfaceMotion;
  }
  const bridgedSurfaceMotion = readBridgedSurfaceMotion(document);
  if (bridgedSurfaceMotion) {
    return bridgedSurfaceMotion;
  }
  if (directSurfaceMotion) {
    return directSurfaceMotion;
  }
  return {
    transformCss: "none",
    transformOriginCss: "0px 0px",
  };
}

export function isSurfaceMotionPayload(value) {
  return typeof value?.transformCss === "string"
    && typeof value?.transformOriginCss === "string";
}

function rectSummary(rect) {
  if (!rect) {
    return null;
  }
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function readRenderedTileFacts(document) {
  const tile = findReferenceTile(document);
  const tileTransform = readTileTransform(tile);
  if (!tile || !tileTransform) {
    return {};
  }
  const rect = tile.getBoundingClientRect?.() ?? {};
  return {
    centerTile: {
      url: tile.currentSrc || tile.src || "",
      tilePx: {
        width: tile.naturalWidth || finiteCssPx(tile.style?.width) || finiteCssPx(tile.getAttribute?.("width")) || rect.width || 256,
        height: tile.naturalHeight || finiteCssPx(tile.style?.height) || finiteCssPx(tile.getAttribute?.("height")) || rect.height || 256,
      },
    },
    tileTransform,
  };
}

function finiteCssPx(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function findReferenceTile(document) {
  const centerTile = document.querySelector?.("img.tile-center");
  if (centerTile && isVisibleElement(centerTile)) {
    return centerTile;
  }
  const tiles = Array.from(document.querySelectorAll?.("img.tile") ?? [])
    .filter(isVisibleElement);
  tiles.sort((left, right) => elementArea(right) - elementArea(left));
  return tiles[0] ?? null;
}

function readTileTransform(tile) {
  if (!tile) {
    return null;
  }
  const ownerWindow = tile.ownerDocument?.defaultView;
  const style = typeof ownerWindow?.getComputedStyle === "function"
    ? ownerWindow.getComputedStyle(tile)
    : null;
  const transformCss = style?.transform ?? tile.style?.transform ?? "";
  const match = /matrix\(([^)]+)\)/u.exec(transformCss);
  if (!match) {
    return null;
  }
  const values = match[1].split(",").map((value) => Number(value.trim()));
  if (values.length !== 6 || !values.every(Number.isFinite)) {
    return null;
  }
  const [a, b, , , x, y] = values;
  const scale = Math.hypot(a, b);
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }
  return {
    x,
    y,
    scale,
  };
}

function isVisibleElement(element) {
  const rect = element?.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function elementArea(element) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function readDirectSurfaceMotion({
  document,
  ownerWindow,
}) {
  const surface = document.querySelector(".supersurface");
  if (!surface) {
    return null;
  }
  const style = typeof ownerWindow.getComputedStyle === "function"
    ? ownerWindow.getComputedStyle(surface)
    : null;
  return {
    transformCss: style?.transform ?? surface.style.transform ?? "none",
    transformOriginCss: style?.transformOrigin ?? surface.style.transformOrigin ?? "0px 0px",
  };
}

function isIdentityTransformCss(transformCss) {
  return transformCss === "none"
    || transformCss === "matrix(1, 0, 0, 1, 0, 0)"
    || transformCss === "matrix(1,0,0,1,0,0)"
    || transformCss === "translate3d(0px, 0px, 0px)"
    || transformCss === "translate(0px, 0px)";
}

function readBridgedSurfaceMotion(document) {
  const encoded = document.documentElement?.dataset?.idOverlaySurfaceMotion;
  if (!encoded) {
    return null;
  }
  try {
    const parsed = JSON.parse(encoded);
    return isSurfaceMotionPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
