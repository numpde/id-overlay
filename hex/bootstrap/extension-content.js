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
  observePageSnapshots,
  readableObservationDocuments,
  SURFACE_MOTION_EVENT_TYPE,
} from "../adapters/page-osm-id/page-observation-runtime.js";
import {
  findEmbeddedEditorFrame,
  findViewportElement,
  isSurfaceMotionPayload,
  readOpenStreetMapPage,
  readSurfaceMotion,
  summarizeObservedPage,
} from "../adapters/page-osm-id/page-dom-reader.js";
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

function installSurfaceMotionBridge({
  ownerWindow,
  chromeApi,
  onSurfaceMotion,
}) {
  ownerWindow.addEventListener("message", (event) => {
    if (
      event.data?.source !== "id-overlay"
        || event.data?.type !== SURFACE_MOTION_EVENT_TYPE
        || !isSurfaceMotionPayload(event.data.surfaceMotion)
    ) {
      return;
    }
    onSurfaceMotion(event.data.surfaceMotion);
  });
  ownerWindow.document?.addEventListener?.(SURFACE_MOTION_EVENT_TYPE, (event) => {
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
