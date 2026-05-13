import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: legacy Trace rendering followed page observation. A
// solved registration was not a stale screen placement; the shell reprojected it
// against the current map view and live surface motion. The open design choice
// is where the map-world solved transform lives. This candidate chooses a shell
// render projection port: application state stays browser-neutral, page facts
// stay outside the app, and the rendered overlay placement changes when the map
// snapshot changes.
test("Trace solved overlay render is derived from the current page snapshot", async () => {
  const storage = createDurableStorageHarness({
    durableState: traceSolvedDurableState(),
  });
  const observation = createPageObservationHarness({
    snapshot: firstTraceSnapshot(),
  });
  const projection = createTraceOverlayProjectionHarness({
    placements: [firstTracePlacement()],
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    pageObservationPort: observation.port,
    traceOverlayProjectionPort: projection.port,
  });

  await bootstrapBrowserExtension(host);

  assert.deepEqual(projection.calls, [{
    applicationView: traceApplicationViewForProjection(),
    pageSnapshot: firstTraceSnapshot(),
  }]);
  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: normalizedReferenceImage().imageDataRef,
    intrinsicSizePx: normalizedReferenceImage().intrinsicSizePx,
    placement: firstTracePlacement(),
    opacity: 1,
    pins: [],
    pageSurfaceMotion: firstTraceSnapshot().surfaceMotion,
  });
  assert.deepEqual(storage.writes, []);
});

// Unclassified candidate: map movement is render-only. When page observation
// reports a new map view or active surface motion, Trace should re-render from
// the new snapshot without writing durable product state and without showing
// Align registration pins.
test("Trace overlay re-renders on page observation changes without durable writes", async () => {
  const storage = createDurableStorageHarness({
    durableState: traceSolvedDurableState(),
  });
  const observation = createPageObservationHarness({
    snapshot: firstTraceSnapshot(),
  });
  const projection = createTraceOverlayProjectionHarness({
    placements: [firstTracePlacement(), secondTracePlacement()],
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    pageObservationPort: observation.port,
    traceOverlayProjectionPort: projection.port,
  });

  await bootstrapBrowserExtension(host);
  observation.emit(secondTraceSnapshot());

  assert.deepEqual(projection.calls.map((call) => call.pageSnapshot), [
    firstTraceSnapshot(),
    secondTraceSnapshot(),
  ]);
  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: normalizedReferenceImage().imageDataRef,
    intrinsicSizePx: normalizedReferenceImage().intrinsicSizePx,
    placement: secondTracePlacement(),
    opacity: 1,
    pins: [],
    pageSurfaceMotion: secondTraceSnapshot().surfaceMotion,
  });
  assert.deepEqual(storage.writes, []);
});

function createBrowserHostHarness({
  durableStatePort,
  pageObservationPort,
  traceOverlayProjectionPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    pageObservationPort,
    traceOverlayProjectionPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createPageObservationHarness({ snapshot }) {
  let currentSnapshot = snapshot;
  let listener = null;
  return {
    emit(nextSnapshot) {
      currentSnapshot = nextSnapshot;
      listener?.(nextSnapshot);
    },
    port: {
      readSnapshot() {
        return currentSnapshot;
      },
      subscribe(nextListener) {
        listener = nextListener;
        nextListener(currentSnapshot);
        return () => {
          listener = null;
        };
      },
    },
  };
}

function createTraceOverlayProjectionHarness({ placements }) {
  const calls = [];
  const pendingPlacements = [...placements];
  return {
    calls,
    port: {
      projectTraceOverlay({ applicationView, pageSnapshot }) {
        calls.push({
          applicationView,
          pageSnapshot,
        });
        return {
          ...applicationView.overlay,
          placement: pendingPlacements.shift(),
          pins: [],
          pageSurfaceMotion: pageSnapshot.surfaceMotion,
        };
      },
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}

function traceSolvedDurableState() {
  return {
    session: {
      mode: "trace",
      referenceImage: normalizedReferenceImage(),
      registration: {
        pins: [firstPin(), secondPin()],
        solvedPlacement: {
          x: 100,
          y: 200,
          scale: 1,
          rotationRad: 0,
        },
      },
    },
  };
}

function traceApplicationViewForProjection() {
  return {
    mode: "trace",
    overlay: {
      visible: true,
      imageDataRef: normalizedReferenceImage().imageDataRef,
      intrinsicSizePx: normalizedReferenceImage().intrinsicSizePx,
      placement: null,
      opacity: 1,
      pins: [],
    },
    overlayInput: {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
    },
    modeSwitch: {
      selected: "trace",
      align: {
        enabled: true,
      },
    },
    history: {
      undo: {
        enabled: false,
        label: null,
      },
      redo: {
        enabled: false,
        label: null,
      },
    },
    primaryAction: {
      label: "Clear image",
      enabled: true,
    },
    status: "Loaded screenshot 640x480.",
  };
}

function firstTraceSnapshot() {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 16,
      centerLatLon: {
        lat: -1.24401,
        lon: 36.82412,
      },
    },
    viewportPx: {
      width: 1280,
      height: 720,
    },
    surfaceMotion: {
      transformCss: "none",
      transformOriginCss: "0px 0px",
    },
  };
}

function secondTraceSnapshot() {
  return {
    ...firstTraceSnapshot(),
    mapView: {
      zoom: 16,
      centerLatLon: {
        lat: -1.24401,
        lon: 36.83412,
      },
    },
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    },
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 10,
      y: 15,
    },
    mapLatLon: {
      lat: -1.24401,
      lon: 36.82412,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 210,
      y: 15,
    },
    mapLatLon: {
      lat: -1.24401,
      lon: 36.84412,
    },
  };
}

function firstTracePlacement() {
  return {
    x: 372,
    y: 272,
    scale: 1,
    rotationRad: 0,
  };
}

function secondTracePlacement() {
  return {
    x: 371.2888888888889,
    y: 272,
    scale: 1,
    rotationRad: 0,
  };
}
