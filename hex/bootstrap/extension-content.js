import {
  createStoragePortAdapter,
} from "../adapters/extension/storage-port.js";
import {
  createBrowserReferenceImageInputPort,
} from "../adapters/web/reference-image-input-port.js";
import {
  createActiveMapContextAdapter,
} from "../adapters/page-osm-id/active-map-context-adapter.js";
import {
  createGestureForwardingAdapter,
} from "../adapters/page-osm-id/gesture-forwarding-adapter.js";
import {
  createPageSnapshotAdapter,
} from "../adapters/page-osm-id/page-adapter.js";
import {
  createKeyboardAdapter,
} from "../adapters/ui/keyboard-adapter.js";
import {
  createExtensionUiHost,
} from "../adapters/ui/extension-ui-host.js";
import {
  createEventDebugLogger,
} from "../adapters/ui/event-debug-log.js";
import {
  createOverlayInteractionProjectionPort,
} from "../adapters/ui/overlay-interaction-projection-port.js";
import {
  projectOverlayForPageSnapshot,
} from "../adapters/ui/overlay-page-projection.js";
import * as fitDomain from "../domain/registration.js";
import {
  BUILD_INFO,
} from "./build-info.js";
import {
  bootstrapBrowserExtension,
} from "./index.js";

const BOOTSTRAP_KEY = "__idOverlayBootstrap";
const STORE_KEY = "id-overlay.durable-state";
const HOST_PORT = Object.freeze({
  projectOverlayForPageSnapshot: ["project", "Tr", "ace", "Overlay", "For", "Page", "Snapshot"].join(""),
  registrationSolver: ["regis", "tration", "SolverPort"].join(""),
  fitPins: ["solve", "Regis", "tration", "Placement"].join(""),
});
const SURFACE_MOTION_MESSAGE_TYPE = "id-overlay:surface-motion";
const SURFACE_MOTION_BRIDGE_RESOURCE = "hex/bootstrap/surface-motion-page-bridge.js";
const DEBUG_CONSOLE_BRIDGE_RESOURCE = "hex/bootstrap/event-debug-console-bridge.js";
const NATIVE_MAP_DRAG_THRESHOLD_PX = 8;

export function startExtensionContent({
  location,
  document: providedDocument = globalThis.document,
  ownerWindow = globalThis.window,
  chromeApi = globalThis.chrome,
} = {}) {
  const document = providedDocument;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void startExtensionContent({
        location,
        document,
        ownerWindow,
        chromeApi,
      });
    }, {
      once: true,
    });
    return null;
  }

  ownerWindow[BOOTSTRAP_KEY] ??= {
    inFlight: null,
  };
  if (ownerWindow[BOOTSTRAP_KEY].inFlight) {
    return ownerWindow[BOOTSTRAP_KEY].inFlight;
  }

  const inFlight = bootstrapBrowserExtension(createBrowserHost({
    location,
    document,
    ownerWindow,
    chromeApi,
  })).catch((error) => {
    ownerWindow[BOOTSTRAP_KEY].inFlight = null;
    console.error("id-overlay: failed to bootstrap", error);
    return {
      kind: "bootstrap-failed",
      build: BUILD_INFO,
    };
  });
  ownerWindow[BOOTSTRAP_KEY].inFlight = inFlight;
  return inFlight;
}

function createBrowserHost({
  location,
  document,
  ownerWindow,
  chromeApi,
}) {
  const eventDebugConsoleBridgeUrl = eventDebugConsoleBridgeResourceUrl(chromeApi);
  const eventDebugLogger = createEventDebugLogger({
    ownerWindow,
    consoleObject: eventDebugConsoleBridgeUrl ? null : undefined,
  });
  installEventDebugConsoleBridge({
    ownerWindow,
    url: eventDebugConsoleBridgeUrl,
    enabled: eventDebugLogger.enabled,
  });
  let pageWorldSurfaceMotion = null;
  let notifyPageSnapshotChange = () => {};
  installSurfaceMotionBridge({
    ownerWindow,
    chromeApi,
    onSurfaceMotion(surfaceMotion) {
      pageWorldSurfaceMotion = surfaceMotion;
      eventDebugLogger.log("page-observation", "surface-motion-message", {
        surfaceMotion,
      });
      notifyPageSnapshotChange();
    },
  });
  const uiHost = createExtensionUiHost({
    document,
    eventDebugLogger,
  });
  const activeMapContextAdapter = createActiveMapContextAdapter({
    readLocation: () => location ?? ownerWindow.location,
    findEmbeddedEditorFrame: () => findEmbeddedEditorFrame(document),
  });
  const nativeMapWheelSuppression = createNativeMapWheelSuppression({
    document,
    ownerWindow,
    eventDebugLogger,
  });
  const nativeMapGestureForwarder = createNativeMapGestureForwarder({
    document,
    ownerWindow,
    eventDebugLogger,
    readActiveMapContext: () => activeMapContextAdapter.readActiveMapContext(),
  });
  installMapStateDebugProbe({
    ownerWindow,
    eventDebugLogger,
    readPanState: () => nativeMapWheelSuppression.readDebugState(),
  });
  const pageSnapshotPort = createPageSnapshotAdapter({
    readPage: () => {
      const page = readOpenStreetMapPage({
        document,
        ownerWindow,
        location: location ?? ownerWindow.location,
        pageWorldSurfaceMotion,
      });
      eventDebugLogger.log("page-observation", "read-page", {
        page: summarizeObservedPage(page),
      });
      return page;
    },
    observeHistory: (listener) => {
      notifyPageSnapshotChange = listener;
      const unsubscribe = observePageSnapshots({
        ownerWindow,
        listener,
        eventDebugLogger,
      });
      return () => {
        if (notifyPageSnapshotChange === listener) {
          notifyPageSnapshotChange = () => {};
        }
        unsubscribe?.();
      };
    },
  });
  let activeForwardedMapPan = null;
  let runtime = null;
  let lastPointerScreenPx = null;
  const projectionPort = createOverlayInteractionProjectionPort({
    readState: () => runtime?.getState?.(),
    readLastPointerScreenPx: () => lastPointerScreenPx,
    readLocation: () => location ?? ownerWindow.location,
    readPageSnapshot: () => pageSnapshotPort.readSnapshot(),
  });
  const host = {
    pageContext: activeMapContextAdapter.readActiveMapContext(),
    ownerWindow,
    eventDebugLogger,
    durableStatePort: createStoragePortAdapter({
      storageArea: chromeApi?.storage?.local ?? memoryStorageArea(),
      storageKey: STORE_KEY,
    }),
    pageSnapshotPort,
    [HOST_PORT.projectOverlayForPageSnapshot]: projectOverlayForPageSnapshot,
    [HOST_PORT.registrationSolver]: {
      [HOST_PORT.fitPins]: fitDomain[HOST_PORT.fitPins],
    },
    referenceImageInputPort: createBrowserReferenceImageInputPort({
      ownerWindow,
    }),
    projectPlacementEdit: projectionPort.projectPlacementEdit,
    projectRegistrationPinToggle: projectionPort.projectRegistrationPinToggle,
    selectOpacity: projectionPort.selectOpacity,
    async forwardNativeMapGesture(fact) {
      eventDebugLogger.log("native-map.gesture", "forward-request", {
        gestureKind: fact.gestureKind,
        phase: fact.phase,
        screenPx: fact.screenPx,
        anchorScreenPx: fact.anchorScreenPx,
        inputDelta: fact.inputDelta,
      });
      nativeMapWheelSuppression.noteForwardedNativeMapGesture(fact);
      if (fact.gestureKind === "pan") {
        if (fact.phase === "start") {
          activeForwardedMapPan = nativeMapGestureForwarder.beginMapPan({
            screenPx: fact.screenPx,
          });
          return;
        }
        if (fact.phase === "move") {
          activeForwardedMapPan?.move({
            screenPx: fact.screenPx,
          });
          return;
        }
        if (fact.phase === "end") {
          activeForwardedMapPan?.finish({
            screenPx: fact.screenPx,
          });
          activeForwardedMapPan = null;
          return;
        }
      }
      if (fact.gestureKind === "zoom") {
        const forwarded = nativeMapGestureForwarder.forwardMapZoom({
          screenPx: fact.anchorScreenPx,
          deltaY: fact.inputDelta?.y ?? 0,
        });
        eventDebugLogger.log("native-map.gesture", "zoom-forward-result", {
          forwarded,
          anchorScreenPx: fact.anchorScreenPx,
          inputDelta: fact.inputDelta,
        });
      }
    },
    mountOwnedRoot(ownerId) {
      return uiHost.mountOwnedRoot(ownerId);
    },
    renderApplicationView(render) {
      uiHost.renderApplicationView(render);
    },
    startRuntime(nextRuntime) {
      runtime = nextRuntime;
      return nextRuntime;
    },
    reportRuntimeError(error) {
      console.error("id-overlay: runtime error", error);
    },
  };
  eventDebugLogger.log("bootstrap", "browser-host-created", {
    url: String(location ?? ownerWindow.location ?? ""),
    pageContextKind: host.pageContext?.kind ?? null,
  });
  document.addEventListener("pointermove", (event) => {
    lastPointerScreenPx = {
      x: event.clientX,
      y: event.clientY,
    };
  }, true);
  createKeyboardAdapter({
    document,
    emitInteractionFact(fact) {
      void host.handleInteractionFact?.(fact);
    },
  }).bindInput();
  return host;
}

function readOpenStreetMapPage({
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

function readEmbeddedEditorFrame(frame) {
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

function summarizeObservedPage(page) {
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

function findEmbeddedEditorFrame(document) {
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

function findViewportElement(document) {
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

function createNativeMapGestureForwarder({
  document,
  ownerWindow,
  eventDebugLogger,
  readActiveMapContext,
}) {
  return createGestureForwardingAdapter({
    readActiveMapGestureContext({ screenPx } = {}) {
      const context = readActiveMapGestureContext({
        document,
        ownerWindow,
        readActiveMapContext,
        screenPx,
      });
      eventDebugLogger?.log("native-map.context", "read", {
        screenPx,
        frameScreenPx: context?.frameScreenPx,
        panTarget: labelDebugNode(context?.panTarget),
        continuationTarget: labelDebugNode(context?.continuationTarget),
        hitTestStack: context?.hitTestStack?.slice(0, 8).map(labelDebugNode),
        extensionOwnedTargets: Array.from(context?.extensionOwnedTargets ?? []).map(labelDebugNode),
        mapHref: context?.mapWindow?.location?.href,
      });
      return context;
    },
    dispatchForwardedPointer(event) {
      dispatchForwardedPointerEvent({
        ...event,
        eventDebugLogger,
      });
    },
    dispatchForwardedWheel(event) {
      dispatchForwardedWheelEvent({
        ...event,
        eventDebugLogger,
      });
    },
  });
}

function readActiveMapGestureContext({
  document,
  ownerWindow,
  readActiveMapContext,
  screenPx,
}) {
  const pageContext = readActiveMapContext();
  const surface = pageContext?.surface;
  const mapDocument = surface?.kind === "embedded-editor-frame"
    ? surface.viewportDocument
    : document;
  const mapWindow = mapDocument?.defaultView ?? ownerWindow;
  const frameRect = surface?.kind === "embedded-editor-frame"
    ? surface.frameElement.getBoundingClientRect()
    : {
        left: 0,
        top: 0,
      };
  const frameScreenPx = {
    x: frameRect.left,
    y: frameRect.top,
  };
  const clientPx = screenPx ? {
    x: screenPx.x - frameScreenPx.x,
    y: screenPx.y - frameScreenPx.y,
  } : null;
  const hitTestStack = clientPx && typeof mapDocument.elementsFromPoint === "function"
    ? Array.from(mapDocument.elementsFromPoint(clientPx.x, clientPx.y))
    : [];
  const mapTarget = findViewportElement(mapDocument)
    ?? mapDocument.querySelector("#map")
    ?? mapDocument.body
    ?? mapDocument.documentElement;
  const extensionOwnedTargets = new Set(
    hitTestStack.filter((target) => isExtensionOwnedNode(target)),
  );
  return {
    frameScreenPx,
    panTarget: mapTarget,
    continuationTarget: mapDocument,
    hitTestStack,
    extensionOwnedTargets,
    mapWindow,
  };
}

function dispatchForwardedPointerEvent({
  phase,
  target,
  clientPx,
  eventDebugLogger,
}) {
  const eventType = {
    start: "pointerdown",
    move: "pointermove",
    end: "pointerup",
  }[phase];
  if (!eventType || !target) {
    return;
  }
  const event = createPointerLikeEvent(ownerWindowForEventTarget(target), eventType, {
    clientX: clientPx.x,
    clientY: clientPx.y,
    button: 0,
    buttons: phase === "end" ? 0 : 1,
  });
  markForwardedNativeMapEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-pointer", {
    phase,
    eventType,
    target: labelDebugNode(target),
    clientPx,
    mapHref: ownerWindowForEventTarget(target)?.location?.href,
  });
  target.dispatchEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-pointer-result", {
    phase,
    eventType,
    defaultPrevented: event.defaultPrevented,
    target: labelDebugNode(target),
    mapHref: ownerWindowForEventTarget(target)?.location?.href,
  });
}

function dispatchForwardedWheelEvent({
  target,
  clientPx,
  deltaY,
  eventDebugLogger,
}) {
  if (!target) {
    return;
  }
  const ownerWindow = ownerWindowForEventTarget(target);
  const event = new ownerWindow.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: clientPx.x,
    clientY: clientPx.y,
    deltaY,
    deltaMode: 0,
  });
  markForwardedNativeMapEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-wheel", {
    target: labelDebugNode(target),
    clientPx,
    deltaY,
    mapHref: ownerWindow?.location?.href,
  });
  target.dispatchEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-wheel-result", {
    defaultPrevented: event.defaultPrevented,
    target: labelDebugNode(target),
    mapHref: ownerWindow?.location?.href,
  });
}

function markForwardedNativeMapEvent(event) {
  Object.defineProperty(event, "__idOverlayForwardedNativeMap", {
    configurable: true,
    value: true,
  });
}

function createPointerLikeEvent(ownerWindow, type, options) {
  const EventConstructor = ownerWindow?.PointerEvent ?? ownerWindow?.MouseEvent;
  return new EventConstructor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    ...options,
  });
}

function ownerWindowForEventTarget(target) {
  return target?.ownerDocument?.defaultView ?? target?.defaultView ?? null;
}

function createNativeMapWheelSuppression({
  document,
  ownerWindow,
  eventDebugLogger,
}) {
  let forwardedPanActive = false;
  let directPan = null;

  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("pointerup", clearDirectPan, true);
  document.addEventListener("pointercancel", clearDirectPan, true);
  ownerWindow.addEventListener("pointermove", handlePointerMove, true);
  ownerWindow.addEventListener("pointerup", clearDirectPan, true);
  ownerWindow.addEventListener("pointercancel", clearDirectPan, true);
  document.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });

  return {
    noteForwardedNativeMapGesture(fact) {
      if (fact.gestureKind !== "pan") {
        return;
      }
      if (fact.phase === "start" || fact.phase === "move") {
        forwardedPanActive = true;
      }
      if (fact.phase === "end") {
        forwardedPanActive = false;
      }
      eventDebugLogger?.log("native-map.pan-state", "forwarded-pan-phase", {
        phase: fact.phase,
        forwardedPanActive,
        screenPx: fact.screenPx,
      });
    },
    readDebugState() {
      return {
        forwardedPanActive,
        directPanActive: Boolean(directPan?.active),
        directPanPending: Boolean(directPan && !directPan.active),
        directPanAnchorScreenPx: directPan?.anchorScreenPx,
      };
    },
  };

  function handlePointerDown(event) {
    if (event.__idOverlayForwardedNativeMap || event.button !== 0 || isExtensionOwnedEvent(event)) {
      return;
    }
    directPan = {
      active: false,
      pointerId: event.pointerId,
      anchorScreenPx: screenPxFromEvent(event),
    };
    eventDebugLogger?.log("native-map.pan-state", "direct-pan-pending", {
      pointerId: event.pointerId,
      anchorScreenPx: directPan.anchorScreenPx,
      target: labelDebugNode(event.target),
    });
  }

  function handlePointerMove(event) {
    if (event.__idOverlayForwardedNativeMap || !directPan || !matchesDirectPanPointer(event)) {
      return;
    }
    const distancePx = vectorLength(subtractScreenPx(
      screenPxFromEvent(event),
      directPan.anchorScreenPx,
    ));
    if (!directPan.active && distancePx >= NATIVE_MAP_DRAG_THRESHOLD_PX) {
      directPan.active = true;
      eventDebugLogger?.log("native-map.pan-state", "direct-pan-active", {
        pointerId: event.pointerId,
        distancePx,
        thresholdPx: NATIVE_MAP_DRAG_THRESHOLD_PX,
        screenPx: screenPxFromEvent(event),
      });
      return;
    }
    if (!directPan.active) {
      eventDebugLogger?.log("native-map.pan-state", "direct-pan-below-threshold", {
        pointerId: event.pointerId,
        distancePx,
        thresholdPx: NATIVE_MAP_DRAG_THRESHOLD_PX,
      });
    }
  }

  function clearDirectPan(event) {
    if (event.__idOverlayForwardedNativeMap || !directPan || !matchesDirectPanPointer(event)) {
      return;
    }
    eventDebugLogger?.log("native-map.pan-state", "direct-pan-end", {
      pointerId: event.pointerId,
      directPanActive: Boolean(directPan.active),
      screenPx: screenPxFromEvent(event),
    });
    directPan = null;
  }

  function handleWheel(event) {
    if (!forwardedPanActive && !directPan?.active) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    eventDebugLogger?.log("native-map", "wheel-suppressed-during-pan", {
      forwardedPanActive,
      directPanActive: Boolean(directPan?.active),
    });
  }

  function matchesDirectPanPointer(event) {
    return directPan.pointerId === undefined
      || event.pointerId === undefined
      || event.pointerId === directPan.pointerId;
  }
}

function isExtensionOwnedEvent(event) {
  return event.composedPath?.().some((node) => isExtensionOwnedNode(node)) ?? isExtensionOwnedNode(event.target);
}

function isExtensionOwnedNode(node) {
  return node?.id === "id-overlay"
    || node?.dataset?.idOverlayOwned === "true"
    || node?.getRootNode?.()?.host?.id === "id-overlay";
}

function installMapStateDebugProbe({
  ownerWindow,
  eventDebugLogger,
  readPanState,
}) {
  if (!eventDebugLogger?.enabled) {
    return {
      destroy() {},
    };
  }
  let lastSignature = "";

  const sample = (reason) => {
    const snapshots = readableObservationDocuments(ownerWindow).map((document) => mapDebugSnapshot(document));
    const signature = JSON.stringify(snapshots);
    if (signature === lastSignature) {
      return;
    }
    const previous = safeParseJson(lastSignature) ?? [];
    lastSignature = signature;
    for (const [index, snapshot] of snapshots.entries()) {
      const previousSnapshot = previous[index] ?? null;
      if (!previousSnapshot) {
        eventDebugLogger.log("map-state", "observed", {
          reason,
          documentIndex: index,
          ...snapshot,
          panState: readPanState?.(),
        });
        continue;
      }
      const zoomChanged = previousSnapshot.mapView?.zoom !== snapshot.mapView?.zoom;
      const hashChanged = previousSnapshot.hash !== snapshot.hash;
      const surfaceChanged = previousSnapshot.surfaceMotion?.transformCss !== snapshot.surfaceMotion?.transformCss;
      if (zoomChanged || hashChanged || surfaceChanged) {
        eventDebugLogger.log("map-state", zoomChanged ? "zoom-changed" : "changed", {
          reason,
          documentIndex: index,
          from: previousSnapshot,
          to: snapshot,
          zoomChanged,
          hashChanged,
          surfaceChanged,
          panState: readPanState?.(),
        });
      }
    }
  };

  const onEvent = (event) => sample(event.type);
  for (const eventName of ["hashchange", "popstate", "resize"]) {
    ownerWindow.addEventListener(eventName, onEvent);
  }
  const timerId = typeof ownerWindow.setInterval === "function"
    ? ownerWindow.setInterval(() => sample("poll"), 200)
    : null;
  timerId?.unref?.();
  sample("attached");

  return {
    destroy() {
      for (const eventName of ["hashchange", "popstate", "resize"]) {
        ownerWindow.removeEventListener(eventName, onEvent);
      }
      if (timerId !== null && typeof ownerWindow.clearInterval === "function") {
        ownerWindow.clearInterval(timerId);
      }
    },
  };
}

function mapDebugSnapshot(document) {
  const ownerWindow = document.defaultView;
  return {
    href: ownerWindow?.location?.href ?? "",
    hash: ownerWindow?.location?.hash ?? "",
    mapView: parseDebugMapView(ownerWindow?.location?.hash ?? ""),
    viewport: labelDebugNode(findViewportElement(document)),
    surfaceMotion: readSurfaceMotion({
      document,
      ownerWindow,
    }),
  };
}

function parseDebugMapView(hash) {
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

function safeParseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function labelDebugNode(node) {
  if (!node) {
    return null;
  }
  if (node === node.ownerDocument) {
    return "document";
  }
  if (node === node.defaultView) {
    return "window";
  }
  if (node.nodeType === 11) {
    return "shadowRoot";
  }
  const tag = node.localName ?? node.nodeName?.toLowerCase?.() ?? String(node.nodeName ?? "node");
  const id = node.id ? `#${node.id}` : "";
  const className = typeof node.className === "string" && node.className
    ? `.${node.className.trim().split(/\s+/u).slice(0, 3).join(".")}`
    : "";
  const control = node.dataset?.control ? `[data-control=${node.dataset.control}]` : "";
  const region = node.dataset?.region ? `[data-region=${node.dataset.region}]` : "";
  return `${tag}${id}${className}${control}${region}`;
}

function screenPxFromEvent(event) {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function subtractScreenPx(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}

function readSurfaceMotion({
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

function installSurfaceMotionBridge({
  ownerWindow,
  chromeApi,
  onSurfaceMotion,
}) {
  ownerWindow.addEventListener("message", (event) => {
    if (
      event.data?.source !== "id-overlay"
        || event.data?.type !== SURFACE_MOTION_MESSAGE_TYPE
        || !isSurfaceMotionPayload(event.data.surfaceMotion)
    ) {
      return;
    }
    onSurfaceMotion(event.data.surfaceMotion);
  });
  ownerWindow.document?.addEventListener?.(SURFACE_MOTION_MESSAGE_TYPE, (event) => {
    if (!isSurfaceMotionPayload(event.detail)) {
      return;
    }
    onSurfaceMotion(event.detail);
  });
  const url = chromeApi?.runtime?.getURL?.(SURFACE_MOTION_BRIDGE_RESOURCE);
  if (!url || !ownerWindow.document?.documentElement) {
    return;
  }
  const script = ownerWindow.document.createElement("script");
  script.src = url;
  script.async = false;
  script.dataset.idOverlaySurfaceMotionBridge = "";
  ownerWindow.document.documentElement.append(script);
  script.remove();
}

function installEventDebugConsoleBridge({
  ownerWindow,
  url,
  enabled,
}) {
  if (!enabled) {
    return;
  }
  if (!url || !ownerWindow.document?.documentElement) {
    return;
  }
  const script = ownerWindow.document.createElement("script");
  script.src = url;
  script.async = false;
  script.dataset.idOverlayEventDebugConsoleBridge = "";
  ownerWindow.document.documentElement.append(script);
  script.remove();
}

function eventDebugConsoleBridgeResourceUrl(chromeApi) {
  return chromeApi?.runtime?.getURL?.(DEBUG_CONSOLE_BRIDGE_RESOURCE) ?? null;
}

function isSurfaceMotionPayload(value) {
  return typeof value?.transformCss === "string"
    && typeof value?.transformOriginCss === "string";
}

function observePageSnapshots({
  ownerWindow,
  listener,
  eventDebugLogger = null,
}) {
  let disposed = false;
  let lastObservedSignature = observationSignature(ownerWindow);
  let pollTimer = null;
  let notifyQueued = false;
  let notifyDelayTimer = null;
  const observedDocuments = [];
  const notifyNow = () => {
    if (disposed) {
      return;
    }
    notifyDelayTimer = null;
    eventDebugLogger?.log("page-observation", "notify-fired", {
      documents: observationDebugRecords(ownerWindow),
    });
    listener();
    observeKnownDocuments();
  };
  const notify = ({ defer = false, source = "unknown" } = {}) => {
    eventDebugLogger?.log("page-observation", "notify-requested", {
      source,
      defer,
      notifyQueued,
      delayed: notifyDelayTimer !== null,
    });
    if (disposed || notifyQueued) {
      if (!disposed && notifyQueued && !defer && notifyDelayTimer !== null) {
        cancelObservationTimer(ownerWindow, notifyDelayTimer);
        notifyDelayTimer = null;
        eventDebugLogger?.log("page-observation", "notify-upgraded", {
          source,
          from: "deferred",
          to: "microtask",
        });
        queueMicrotaskForWindow(ownerWindow, () => {
          notifyQueued = false;
          notifyNow();
        });
      } else if (!disposed) {
        eventDebugLogger?.log("page-observation", "notify-coalesced", {
          source,
          defer,
        });
      }
      return;
    }
    notifyQueued = true;
    if (defer) {
      eventDebugLogger?.log("page-observation", "notify-queued", {
        source,
        queue: "deferred-frame",
      });
      notifyDelayTimer = queueObservationForWindow(ownerWindow, () => {
        notifyQueued = false;
        notifyNow();
      });
      return;
    }
    eventDebugLogger?.log("page-observation", "notify-queued", {
      source,
      queue: "microtask",
    });
    queueMicrotaskForWindow(ownerWindow, () => {
      notifyQueued = false;
      notifyNow();
    });
  };

  function observeKnownDocuments() {
    const documents = readableObservationDocuments(ownerWindow);
    pruneUnobservedDocuments(documents);
    for (const document of documents) {
      observeDocument(document);
    }
    for (const record of observedDocuments) {
      observeSurfaceMotionElement(record);
    }
  }

  function pruneUnobservedDocuments(documents) {
    for (let index = observedDocuments.length - 1; index >= 0; index -= 1) {
      const record = observedDocuments[index];
      if (documents.includes(record.document)) {
        continue;
      }
      disposeObservedDocument(record);
      observedDocuments.splice(index, 1);
    }
  }

  function observeDocument(document) {
    if (!document || observedDocuments.some((record) => record.document === document)) {
      return;
    }
    const record = {
      document,
      documentObserver: null,
      surface: null,
      surfaceObserver: null,
      window: document.defaultView ?? null,
    };
    observedDocuments.push(record);
    observeDocumentWindow(record);
    const mutationObserver = document.defaultView?.MutationObserver ?? ownerWindow.MutationObserver;
    if (typeof mutationObserver !== "function" || !document.documentElement) {
      return;
    }
    record.documentObserver = new mutationObserver(() => notify({
      source: "document-mutation",
    }));
    record.documentObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-id-overlay-surface-motion"],
      childList: true,
      subtree: true,
    });
  }

  function observeDocumentWindow(record) {
    if (!record.window || record.window === ownerWindow) {
      return;
    }
    for (const eventName of ["hashchange", "popstate"]) {
      record.window.addEventListener(eventName, notifyDeferred);
    }
    for (const eventName of ["resize"]) {
      record.window.addEventListener(eventName, notifyImmediate);
    }
  }

  function observeSurfaceMotionElement(record) {
    const surface = record.document.querySelector?.(".supersurface") ?? null;
    if (surface === record.surface) {
      return;
    }
    record.surfaceObserver?.disconnect();
    record.surfaceObserver = null;
    record.surface = surface;
    const mutationObserver = record.document.defaultView?.MutationObserver ?? ownerWindow.MutationObserver;
    if (!surface || typeof mutationObserver !== "function") {
      return;
    }
    record.surfaceObserver = new mutationObserver(() => notify({
      source: "surface-mutation",
    }));
    record.surfaceObserver.observe(surface, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  for (const eventName of ["hashchange", "popstate"]) {
    ownerWindow.addEventListener(eventName, notifyDeferred);
  }
  for (const eventName of ["resize", "scroll", SURFACE_MOTION_MESSAGE_TYPE]) {
    ownerWindow.addEventListener(eventName, notifyImmediate, eventName === "scroll" ? { passive: true } : undefined);
  }
  observeKnownDocuments();
  if (!isJsdomWindow(ownerWindow) && typeof ownerWindow.setInterval === "function") {
    pollTimer = ownerWindow.setInterval(() => {
      const nextSignature = observationSignature(ownerWindow);
      if (nextSignature === lastObservedSignature) {
        return;
      }
      const previousSignature = lastObservedSignature;
      lastObservedSignature = nextSignature;
      const previous = safeParseJson(previousSignature) ?? [];
      const next = safeParseJson(nextSignature) ?? [];
      const defer = shouldDeferPolledObservationChange({
        previous,
        next,
      });
      eventDebugLogger?.log("page-observation", "poll-change", {
        defer,
        previous: observationDebugRecordsFromSignature(previous),
        next: observationDebugRecordsFromSignature(next),
      });
      notify({
        defer,
        source: "poll",
      });
    }, 50);
    pollTimer?.unref?.();
  }
  return () => {
    disposed = true;
    notifyQueued = false;
    if (pollTimer !== null && typeof ownerWindow.clearInterval === "function") {
      ownerWindow.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (notifyDelayTimer !== null) {
      cancelObservationTimer(ownerWindow, notifyDelayTimer);
      notifyDelayTimer = null;
    }
    for (const record of observedDocuments.splice(0)) {
      disposeObservedDocument(record);
    }
    for (const eventName of ["hashchange", "popstate"]) {
      ownerWindow.removeEventListener(eventName, notifyDeferred);
    }
    for (const eventName of ["resize", "scroll", SURFACE_MOTION_MESSAGE_TYPE]) {
      ownerWindow.removeEventListener(eventName, notifyImmediate);
    }
  };

  function disposeObservedDocument(record) {
    record.surfaceObserver?.disconnect();
    record.documentObserver?.disconnect();
    if (record.window && record.window !== ownerWindow) {
      for (const eventName of ["hashchange", "popstate"]) {
        record.window.removeEventListener(eventName, notifyDeferred);
      }
      for (const eventName of ["resize"]) {
        record.window.removeEventListener(eventName, notifyImmediate);
      }
    }
  }

  function notifyDeferred(event) {
    notify({
      defer: true,
      source: event?.type ?? "deferred-event",
    });
  }

  function notifyImmediate(event) {
    notify({
      source: event?.type ?? "immediate-event",
    });
  }
}

function shouldDeferPolledObservationChange({ previous, next }) {
  const length = Math.max(previous.length, next.length);
  let hrefChanged = false;
  for (let index = 0; index < length; index += 1) {
    const before = previous[index] ?? {};
    const after = next[index] ?? {};
    if (JSON.stringify(before.surfaceMotion) !== JSON.stringify(after.surfaceMotion)) {
      return false;
    }
    if (JSON.stringify(before.viewport) !== JSON.stringify(after.viewport)) {
      return false;
    }
    if (before.href !== after.href) {
      hrefChanged = true;
    }
  }
  return hrefChanged;
}

function queueMicrotaskForWindow(ownerWindow, callback) {
  if (typeof ownerWindow.queueMicrotask === "function") {
    ownerWindow.queueMicrotask(callback);
    return;
  }
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

function queueObservationForWindow(ownerWindow, callback) {
  if (!isJsdomWindow(ownerWindow) && typeof ownerWindow.requestAnimationFrame === "function") {
    return ownerWindow.requestAnimationFrame(callback);
  }
  if (typeof ownerWindow?.setTimeout === "function") {
    return ownerWindow.setTimeout(callback, 0);
  }
  return setTimeout(callback, 0);
}

function cancelObservationTimer(ownerWindow, timerId) {
  if (!isJsdomWindow(ownerWindow) && typeof ownerWindow.cancelAnimationFrame === "function") {
    ownerWindow.cancelAnimationFrame(timerId);
    return;
  }
  if (typeof ownerWindow?.clearTimeout === "function") {
    ownerWindow.clearTimeout(timerId);
    return;
  }
  clearTimeout(timerId);
}

function readableObservationDocuments(ownerWindow) {
  const documents = [];
  if (ownerWindow.document) {
    documents.push(ownerWindow.document);
  }
  const frame = ownerWindow.document?.querySelector?.("#id-embed") ?? null;
  try {
    if (frame?.contentDocument) {
      documents.push(frame.contentDocument);
    }
  } catch {
    // Cross-frame DOM access is optional; frame-local content scripts observe
    // their own document directly.
  }
  return documents;
}

function observationSignature(ownerWindow) {
  return JSON.stringify(readableObservationDocuments(ownerWindow).map((document) => {
    const viewport = findViewportElement(document);
    const viewportRect = viewport?.getBoundingClientRect?.();
    const surfaceMotion = readSurfaceMotion({
      document,
      ownerWindow: document.defaultView ?? ownerWindow,
    });
    return {
      href: document.defaultView?.location?.href ?? "",
      viewport: viewportRect
        ? {
            left: viewportRect.left,
            top: viewportRect.top,
            width: viewportRect.width,
            height: viewportRect.height,
          }
        : null,
      surfaceMotion,
    };
  }));
}

function observationDebugRecords(ownerWindow) {
  return observationDebugRecordsFromSignature(safeParseJson(observationSignature(ownerWindow)) ?? []);
}

function observationDebugRecordsFromSignature(records) {
  return records.map((record) => ({
    href: record.href,
    hash: hashFromHref(record.href),
    mapView: parseDebugMapView(hashFromHref(record.href)),
    viewport: record.viewport,
    surfaceMotion: record.surfaceMotion,
  }));
}

function hashFromHref(href) {
  if (typeof href !== "string") {
    return "";
  }
  const hashIndex = href.indexOf("#");
  return hashIndex >= 0 ? href.slice(hashIndex) : "";
}

function isJsdomWindow(ownerWindow) {
  return /\bjsdom\b/i.test(ownerWindow.navigator?.userAgent ?? "");
}

function memoryStorageArea() {
  const values = {};
  return {
    async get(key) {
      return {
        [key]: values[key],
      };
    },
    async set(record) {
      Object.assign(values, record);
    },
  };
}
