import {
  createStoragePortAdapter,
} from "../adapters/extension/storage-port.js";
import {
  createBrowserReferenceImageInputPort,
} from "../adapters/web/reference-image-input-port.js";
import {
  createTimerPortAdapter,
} from "../adapters/web/timer-port.js";
import {
  createActiveMapContextAdapter,
} from "../adapters/page-osm-id/active-map-context-adapter.js";
import {
  createPageSnapshotAdapter,
} from "../adapters/page-osm-id/page-adapter.js";
import {
  observePageSnapshots,
} from "../adapters/page-osm-id/page-observation-runtime.js";
import {
  installMapStateDebugProbe,
} from "../adapters/page-osm-id/map-state-debug-probe.js";
import {
  createOpenStreetMapMapViewPort,
} from "../adapters/page-osm-id/map-view-port-adapter.js";
import {
  createNativeMapGestureForwarder,
} from "../adapters/page-osm-id/native-map-gesture-forwarder.js";
import {
  createNativeMapWheelSuppression,
} from "../adapters/page-osm-id/native-map-wheel-suppression.js";
import {
  findEmbeddedEditorFrame,
  readOpenStreetMapPage,
  summarizeObservedPage,
} from "../adapters/page-osm-id/page-dom-reader.js";
import {
  createKeyboardAdapter,
} from "../adapters/ui/keyboard-adapter.js";
import {
  createExtensionUiHost,
} from "../adapters/ui/extension-ui-host.js";
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
import {
  createContentEventDebugLogger,
  installSurfaceMotionBridge,
} from "./content-script-bridges.js";

const BOOTSTRAP_KEY = "__idOverlayBootstrap";
const STORE_KEY = "id-overlay.durable-state";
const HOST_PORT = Object.freeze({
  projectOverlayForPageSnapshot: "projectTraceOverlayForPageSnapshot",
  registrationSolver: "registrationSolverPort",
  fitPins: "solveRegistrationPlacement",
});
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
  const disposers = [];
  let disposed = false;
  const eventDebugLogger = createContentEventDebugLogger({
    ownerWindow,
    chromeApi,
  });
  let pageWorldSurfaceMotion = null;
  let notifyPageSnapshotChange = () => {};
  const surfaceMotionBridge = installSurfaceMotionBridge({
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
  disposers.push(() => surfaceMotionBridge.destroy?.());
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
  disposers.push(() => nativeMapWheelSuppression.destroy?.());
  const nativeMapGestureForwarder = createNativeMapGestureForwarder({
    document,
    ownerWindow,
    eventDebugLogger,
    readPageContext: () => activeMapContextAdapter.readActiveMapContext(),
  });
  const mapStateDebugProbe = installMapStateDebugProbe({
    ownerWindow,
    eventDebugLogger,
    readPanState: () => nativeMapWheelSuppression.readDebugState(),
  });
  disposers.push(() => mapStateDebugProbe.destroy?.());
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
    mapViewPort: createOpenStreetMapMapViewPort({
      ownerWindow,
      findEmbeddedEditorFrame: () => findEmbeddedEditorFrame(document),
      eventDebugLogger,
    }),
    [HOST_PORT.projectOverlayForPageSnapshot]: projectOverlayForPageSnapshot,
    [HOST_PORT.registrationSolver]: {
      [HOST_PORT.fitPins]: fitDomain[HOST_PORT.fitPins],
    },
    referenceImageInputPort: createBrowserReferenceImageInputPort({
      ownerWindow,
    }),
    timerPort: createTimerPortAdapter({
      setTimer(delayMs, callback) {
        return ownerWindow.setTimeout(callback, delayMs);
      },
      clearTimer(handle) {
        ownerWindow.clearTimeout(handle);
      },
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
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const dispose of disposers.splice(0)) {
        dispose();
      }
      eventDebugLogger.flush?.();
    },
    reportRuntimeError(error) {
      console.error("id-overlay: runtime error", error);
    },
  };
  eventDebugLogger.log("bootstrap", "browser-host-created", {
    url: String(location ?? ownerWindow.location ?? ""),
    pageContextKind: host.pageContext?.kind ?? null,
  });
  const rememberPointerScreenPx = (event) => {
    lastPointerScreenPx = {
      x: event.clientX,
      y: event.clientY,
    };
  };
  document.addEventListener("pointermove", rememberPointerScreenPx, true);
  disposers.push(() => document.removeEventListener("pointermove", rememberPointerScreenPx, true));
  const keyboardAdapter = createKeyboardAdapter({
    document,
    ownerWindow,
    emitInteractionFact(fact) {
      void host.handleInteractionFact?.(fact);
    },
  });
  keyboardAdapter.bindInput();
  disposers.push(() => keyboardAdapter.destroy?.());
  return host;
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
