import { getViewportCenter } from "../core/transform.js";

const ID_EMBED_SELECTOR = "#id-embed";
const SURFACE_MOTION_SELECTOR = ".supersurface";
const VIEWPORT_SELECTORS = [
  ".main-map",
  ".supersurface",
  "#map",
  ".map-pane",
  ".maplibregl-canvas-container",
  ".leaflet-container",
];

const DEFAULT_MAP_VIEW = Object.freeze({
  center: { lat: 0, lon: 0 },
  zoom: 2,
});

const TILE_SIZE = 256;

export function createPageAdapter({
  hashTarget = globalThis.window,
  viewportDocument = globalThis.document,
} = {}) {
  let viewportElement = null;
  let mutationObserver = null;
  let snapshotLoopHandle = null;
  let usingAnimationFrameLoop = false;
  let restoreHistoryMethods = null;
  let observedMapWindow = null;
  let observedMutationRoot = null;
  let lastSnapshot = null;
  let activeSharedDrag = null;
  const listeners = new Set();

  function isSupported() {
    const location = getSafeLocation(hashTarget);
    return location.origin === "https://www.openstreetmap.org" &&
      location.pathname.startsWith("/edit");
  }

  function getViewportElement() {
    const context = getActiveMapContext();
    return resolveViewportElement(context);
  }

  function getViewportRect() {
    return getSnapshot().viewportRect;
  }

  function getLocalViewportRect() {
    return getSnapshot().localViewportRect;
  }

  function getSurfaceMotion() {
    return getSnapshot().surfaceMotion;
  }

  function getMapView() {
    return getSnapshot().mapView;
  }

  function getMapCenter() {
    return getMapView().center;
  }

  function getOverlayMountElement() {
    return resolveOverlayMountElement(getActiveMapContext());
  }

  function mapToScreen(point) {
    const projection = getProjectionContext();
    const pointWorld = projectLatLon(point, projection.mapView.zoom);

    return {
      x: projection.viewportCenter.x + (pointWorld.x - projection.centerWorld.x),
      y: projection.viewportCenter.y + (pointWorld.y - projection.centerWorld.y),
    };
  }

  function screenToMap(screenPoint) {
    const projection = getProjectionContext();

    return unprojectWorld({
      x: projection.centerWorld.x + (screenPoint.x - projection.viewportCenter.x),
      y: projection.centerWorld.y + (screenPoint.y - projection.viewportCenter.y),
    }, projection.mapView.zoom);
  }

  function beginSharedDrag(screenPoint) {
    const context = getActiveMapContext();
    const clientPoint = toContextClientPoint(screenPoint, context);
    const target = resolveSharedDragTarget(context, clientPoint);
    if (!target) {
      activeSharedDrag = null;
      return false;
    }

    activeSharedDrag = {
      context,
      target,
    };
    dispatchSharedDragMouseSequence({
      context,
      target,
      type: "down",
      clientPoint,
    });
    return true;
  }

  function updateSharedDrag(screenPoint, screenDelta) {
    if (!activeSharedDrag) {
      return false;
    }

    const clientPoint = toContextClientPoint(screenPoint, activeSharedDrag.context);
    dispatchSharedDragMouseSequence({
      context: activeSharedDrag.context,
      target: activeSharedDrag.context.viewportDocument,
      type: "move",
      clientPoint,
    });
    return true;
  }

  function endSharedDrag(screenPoint) {
    if (!activeSharedDrag) {
      return;
    }

    const clientPoint = toContextClientPoint(screenPoint, activeSharedDrag.context);
    dispatchSharedDragMouseSequence({
      context: activeSharedDrag.context,
      target: activeSharedDrag.context.viewportDocument,
      type: "up",
      clientPoint,
    });
    activeSharedDrag = null;
  }

  function forwardSharedWheel({ screenPoint, deltaX = 0, deltaY = 0, deltaMode = 0 }) {
    const context = getActiveMapContext();
    const clientPoint = toContextClientPoint(screenPoint, context);
    const target = resolveSharedDragTarget(context, clientPoint);
    if (!target || typeof context.mapWindow.WheelEvent !== "function") {
      return false;
    }

    target.dispatchEvent(new context.mapWindow.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: clientPoint.x,
      clientY: clientPoint.y,
      screenX: clientPoint.x,
      screenY: clientPoint.y,
      deltaX,
      deltaY,
      deltaMode,
      view: context.mapWindow,
    }));
    return true;
  }

  function subscribe(listener) {
    listeners.add(listener);
    startWatching();
    listener(getSnapshot());
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        stopWatching();
      }
    };
  }

  function getSnapshot() {
    return createSnapshot(resolveSnapshotState(getActiveMapContext()));
  }

  function notifyIfChanged() {
    syncObservedContext();
    const nextSnapshot = getSnapshot();
    if (lastSnapshot && snapshotsEqual(lastSnapshot, nextSnapshot)) {
      return;
    }
    lastSnapshot = nextSnapshot;
    for (const listener of listeners) {
      listener(nextSnapshot);
    }
  }

  function startWatching() {
    if (snapshotLoopHandle) {
      return;
    }

    hashTarget.addEventListener("resize", notifyIfChanged);
    hashTarget.addEventListener("scroll", notifyIfChanged, { passive: true });
    hashTarget.addEventListener("hashchange", notifyIfChanged);
    hashTarget.addEventListener("popstate", notifyIfChanged);
    mutationObserver = new MutationObserver(handleStructureMutation);
    syncObservedContext();
    startSnapshotLoop();
  }

  function stopWatching() {
    if (!snapshotLoopHandle) {
      return;
    }

    stopSnapshotLoop();
    hashTarget.removeEventListener("resize", notifyIfChanged);
    hashTarget.removeEventListener("scroll", notifyIfChanged);
    hashTarget.removeEventListener("hashchange", notifyIfChanged);
    hashTarget.removeEventListener("popstate", notifyIfChanged);
    detachObservedContext();
    lastSnapshot = null;
  }

  function destroy() {
    stopWatching();
    listeners.clear();
    viewportElement = null;
  }

  return {
    isSupported,
    getSnapshot,
    getViewportRect,
    getLocalViewportRect,
    getMapView,
    getMapCenter,
    getOverlayMountElement,
    mapToScreen,
    screenToMap,
    beginSharedDrag,
    updateSharedDrag,
    endSharedDrag,
    forwardSharedWheel,
    subscribe,
    destroy,
  };

  function resolveViewportElement(context) {
    if (
      viewportElement?.isConnected &&
      viewportElement.ownerDocument === context.viewportDocument
    ) {
      return viewportElement;
    }

    viewportElement = findViewportElement(context.viewportDocument);
    return viewportElement;
  }

  function resolveViewportRect(context) {
    const element = resolveViewportElement(context);
    if (!element) {
      return context.frameElement
        ? rectFromDomRect(context.frameElement.getBoundingClientRect())
        : createWindowViewportRect(hashTarget);
    }
    const rect = element.getBoundingClientRect();
    return context.frameElement
      ? translateRectByFrame(rect, context.frameElement)
      : rectFromDomRect(rect);
  }

  function resolveLocalViewportRect(context) {
    const viewportElement = resolveViewportElement(context);
    if (!viewportElement) {
      return createWindowViewportRect(context.mapWindow);
    }
    const viewportRect = rectFromDomRect(viewportElement.getBoundingClientRect());
    const mountElement = resolveOverlayMountElement(context);
    if (!mountElement || mountElement === viewportElement) {
      return {
        left: 0,
        top: 0,
        width: viewportRect.width,
        height: viewportRect.height,
      };
    }

    const mountRect = rectFromDomRect(mountElement.getBoundingClientRect());
    return {
      left: viewportRect.left - mountRect.left,
      top: viewportRect.top - mountRect.top,
      width: viewportRect.width,
      height: viewportRect.height,
    };
  }

  function resolveSurfaceMotion(context) {
    const surfaceElement = context.viewportDocument.querySelector(SURFACE_MOTION_SELECTOR);
    if (!surfaceElement) {
      return createSurfaceMotion();
    }

    const view = surfaceElement.ownerDocument?.defaultView ?? globalThis;
    const style = typeof view.getComputedStyle === "function"
      ? view.getComputedStyle(surfaceElement)
      : null;

    return createSurfaceMotion({
      transformCss: style?.transform ?? surfaceElement.style.transform ?? "none",
      transformOriginCss: style?.transformOrigin ?? surfaceElement.style.transformOrigin ?? "0px 0px",
    });
  }

  function resolveMapView(context) {
    const viewportRect = resolveViewportRect(context);
    return derivePreciseMapViewFromTiles({ context, viewportRect }) ??
      parseMapViewFromHash(getSafeLocation(context.mapWindow).hash);
  }

  function resolveSnapshotState(context) {
    return {
      viewportRect: resolveViewportRect(context),
      localViewportRect: resolveLocalViewportRect(context),
      mapView: resolveMapView(context),
      surfaceMotion: resolveSurfaceMotion(context),
    };
  }

  function getProjectionContext() {
    return createProjectionContext(getSnapshot());
  }

  function getActiveMapContext() {
    const embedFrame = findEmbeddedIdFrame(viewportDocument);
    if (embedFrame) {
      return {
        mapWindow: embedFrame.contentWindow,
        viewportDocument: embedFrame.contentDocument,
        frameElement: embedFrame,
      };
    }
    return {
      mapWindow: hashTarget,
      viewportDocument,
      frameElement: null,
    };
  }

  function syncObservedContext() {
    const context = getActiveMapContext();
    const mutationRoot = resolveMutationRoot(context.viewportDocument);
    if (observedMutationRoot !== mutationRoot) {
      mutationObserver?.disconnect();
      mutationObserver?.observe(mutationRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style", "src"],
      });
      observedMutationRoot = mutationRoot;
      viewportElement = null;
    }

    if (observedMapWindow === context.mapWindow) {
      return;
    }

    if (observedMapWindow) {
      observedMapWindow.removeEventListener("hashchange", notifyIfChanged);
      observedMapWindow.removeEventListener("popstate", notifyIfChanged);
      restoreHistoryMethods?.();
      restoreHistoryMethods = null;
    }

    observedMapWindow = context.mapWindow;
    if (observedMapWindow) {
      observedMapWindow.addEventListener("hashchange", notifyIfChanged);
      observedMapWindow.addEventListener("popstate", notifyIfChanged);
      restoreHistoryMethods = patchHistoryMethods({
        hashTarget: observedMapWindow,
        onHistoryMutation: notifyIfChanged,
      });
    }
  }

  function detachObservedContext() {
    restoreHistoryMethods?.();
    restoreHistoryMethods = null;
    if (observedMapWindow) {
      observedMapWindow.removeEventListener("hashchange", notifyIfChanged);
      observedMapWindow.removeEventListener("popstate", notifyIfChanged);
    }
    observedMapWindow = null;
    observedMutationRoot = null;
    mutationObserver?.disconnect();
    mutationObserver = null;
  }

  function handleStructureMutation() {
    viewportElement = null;
    notifyIfChanged();
  }

  function startSnapshotLoop() {
    if (typeof hashTarget.requestAnimationFrame === "function") {
      usingAnimationFrameLoop = true;
      const tick = () => {
        notifyIfChanged();
        snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      };
      snapshotLoopHandle = hashTarget.requestAnimationFrame(tick);
      return;
    }

    usingAnimationFrameLoop = false;
    snapshotLoopHandle = hashTarget.setInterval(notifyIfChanged, 150);
  }

  function stopSnapshotLoop() {
    if (!snapshotLoopHandle) {
      return;
    }
    if (usingAnimationFrameLoop && typeof hashTarget.cancelAnimationFrame === "function") {
      hashTarget.cancelAnimationFrame(snapshotLoopHandle);
    } else {
      hashTarget.clearInterval(snapshotLoopHandle);
    }
    snapshotLoopHandle = null;
    usingAnimationFrameLoop = false;
  }
}

function patchHistoryMethods({ hashTarget, onHistoryMutation }) {
  const history = hashTarget.history;
  if (!history) {
    return null;
  }

  const originalReplaceState = typeof history.replaceState === "function"
    ? history.replaceState.bind(history)
    : null;
  const originalPushState = typeof history.pushState === "function"
    ? history.pushState.bind(history)
    : null;

  if (!originalReplaceState && !originalPushState) {
    return null;
  }

  if (originalReplaceState) {
    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState(...args);
      onHistoryMutation();
      return result;
    };
  }

  if (originalPushState) {
    history.pushState = function patchedPushState(...args) {
      const result = originalPushState(...args);
      onHistoryMutation();
      return result;
    };
  }

  return () => {
    if (originalReplaceState) {
      history.replaceState = originalReplaceState;
    }
    if (originalPushState) {
      history.pushState = originalPushState;
    }
  };
}

function createSnapshot({ viewportRect, localViewportRect, mapView, surfaceMotion }) {
  return {
    viewportRect,
    localViewportRect,
    mapView,
    surfaceMotion,
  };
}

function createProjectionContext(snapshot) {
  return {
    viewportRect: snapshot.viewportRect,
    mapView: snapshot.mapView,
    viewportCenter: getViewportCenter(snapshot.viewportRect),
    centerWorld: projectLatLon(snapshot.mapView.center, snapshot.mapView.zoom),
  };
}

function createSurfaceMotion({
  transformCss = "none",
  transformOriginCss = "0px 0px",
} = {}) {
  return {
    transformCss,
    transformOriginCss,
  };
}

function createWindowViewportRect(hashTarget) {
  return {
    left: 0,
    top: 0,
    width: hashTarget.innerWidth,
    height: hashTarget.innerHeight,
  };
}

function resolveSharedDragTarget(context, clientPoint) {
  const target = resolveUnderlyingMapTargetAtClientPoint(context.viewportDocument, clientPoint);
  return target ?? findViewportElement(context.viewportDocument) ?? context.viewportDocument.body;
}

function resolveUnderlyingMapTargetAtClientPoint(viewportDocument, clientPoint) {
  const elementsAtPoint = viewportDocument.elementsFromPoint?.(clientPoint.x, clientPoint.y);
  if (Array.isArray(elementsAtPoint) && elementsAtPoint.length) {
    const nonOverlayTarget = elementsAtPoint.find((element) => !isOverlayOwnedElement(element));
    if (nonOverlayTarget) {
      return nonOverlayTarget;
    }
  }

  const target = viewportDocument.elementFromPoint?.(clientPoint.x, clientPoint.y);
  if (target && !isOverlayOwnedElement(target)) {
    return target;
  }

  return null;
}

function toContextClientPoint(screenPoint, context) {
  if (!context.frameElement) {
    return {
      x: screenPoint.x,
      y: screenPoint.y,
    };
  }
  const frameRect = context.frameElement.getBoundingClientRect();
  return {
    x: screenPoint.x - frameRect.left,
    y: screenPoint.y - frameRect.top,
  };
}

function dispatchSharedDragMouseSequence({ context, target, type, clientPoint }) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX: clientPoint.x,
    clientY: clientPoint.y,
    screenX: clientPoint.x,
    screenY: clientPoint.y,
    button: 0,
    buttons: type === "up" ? 0 : 1,
    view: context.mapWindow,
  };

  if (typeof context.mapWindow.PointerEvent === "function") {
    const pointerType = type === "down" ? "pointerdown" : type === "move" ? "pointermove" : "pointerup";
    target.dispatchEvent(new context.mapWindow.PointerEvent(pointerType, {
      ...eventInit,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }));
  }

  const mouseType = type === "down" ? "mousedown" : type === "move" ? "mousemove" : "mouseup";
  target.dispatchEvent(new context.mapWindow.MouseEvent(mouseType, eventInit));
}

function rectFromDomRect(rect) {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function translateRectByFrame(innerRect, frameElement) {
  const frameRect = frameElement.getBoundingClientRect();
  return {
    left: frameRect.left + innerRect.left,
    top: frameRect.top + innerRect.top,
    width: innerRect.width,
    height: innerRect.height,
  };
}

function resolveMutationRoot(viewportDocument) {
  return viewportDocument.body ?? viewportDocument.documentElement ?? viewportDocument;
}

function resolveOverlayMountElement(context) {
  return findViewportElement(context.viewportDocument)
    ?? context.viewportDocument.body
    ?? context.viewportDocument.documentElement
    ?? null;
}

function isOverlayOwnedElement(element) {
  return Boolean(
    element &&
    typeof element.closest === "function" &&
    element.closest("[data-id-overlay-owned=\"true\"]"),
  );
}

function findEmbeddedIdFrame(viewportDocument) {
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

function findViewportElement(viewportDocument) {
  const candidates = VIEWPORT_SELECTORS
    .map((selector) => viewportDocument.querySelector(selector))
    .filter(Boolean)
    .filter(isVisible);

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => areaOf(right) - areaOf(left));
  return candidates[0];
}

function findReferenceTile(viewportDocument) {
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
    center: unprojectWorld(centerWorld, 0),
    zoom: effectiveZoom,
  };
}

function parseMapViewFromHash(hash) {
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

function formatZoom(zoom) {
  return Number(zoom).toFixed(2).replace(/\.00$/, "");
}

function formatCoordinate(value) {
  return Number(value).toFixed(6);
}

function getSafeLocation(hashTarget) {
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

function projectLatLon({ lat, lon }, zoom) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const sin = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sin));

  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * scale,
  };
}

function unprojectWorld({ x, y }, zoom) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lon };
}

function snapshotsEqual(left, right) {
  return (
    left.viewportRect.left === right.viewportRect.left &&
    left.viewportRect.top === right.viewportRect.top &&
    left.viewportRect.width === right.viewportRect.width &&
    left.viewportRect.height === right.viewportRect.height &&
    left.localViewportRect.left === right.localViewportRect.left &&
    left.localViewportRect.top === right.localViewportRect.top &&
    left.localViewportRect.width === right.localViewportRect.width &&
    left.localViewportRect.height === right.localViewportRect.height &&
    left.mapView.zoom === right.mapView.zoom &&
    left.mapView.center.lat === right.mapView.center.lat &&
    left.mapView.center.lon === right.mapView.center.lon &&
    left.surfaceMotion.transformCss === right.surfaceMotion.transformCss &&
    left.surfaceMotion.transformOriginCss === right.surfaceMotion.transformOriginCss
  );
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function areaOf(element) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}
