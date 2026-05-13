import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotAdapter,
} from "../../../adapters/page-osm-id/observation-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: expected OSM navigation gaps are adapter facts, not adapter
// exceptions.
test("page observation reports missing map view as an explicit unavailable fact", () => {
  const trace = createPageObservationTrace(
    "page observation reports missing map view as an explicit unavailable fact",
  );
  const adapter = createPageSnapshotAdapter({
    readPage() {
      return {
        hash: "",
        viewport: {
          width: 1280,
          height: 720,
        },
        tileTransform: {
          x: 0,
          y: 0,
          scale: 1,
        },
      };
    },
  });

  assert.deepEqual(readSnapshot({ trace, adapter }), {
    kind: "unavailable-map-snapshot",
    reason: "missing-map-view",
  });
  assert.deepEqual(trace.edges, pageSnapshotReadEdges());
});

// Class-b: when OpenStreetMap hosts iD in an embedded frame, observation facts
// come from the active editor document and are translated back into page screen
// space. The DOM discovery mechanics are adapter detail.
test("page observation prefers the embedded iD editor frame for map facts", () => {
  const trace = createPageObservationTrace(
    "page observation prefers the embedded iD editor frame for map facts",
  );
  const adapter = createPageSnapshotAdapter({
    readPage() {
      return {
        hash: "#map=16/-1.22645/36.82597",
        viewport: {
          width: 1200,
          height: 800,
        },
        tileTransform: {
          x: 0,
          y: 0,
          scale: 1,
        },
        embeddedEditorFrame: {
          frameRect: {
            left: 300,
            top: 40,
          },
          hash: "#map=17/-1.21000/36.83000&background=Bing",
          viewportRect: {
            left: 20,
            top: 30,
            width: 700,
            height: 500,
          },
          surfaceMotion: {
            transformCss: "matrix(1, 0, 0, 1, 18, -12)",
            transformOriginCss: "0px 0px",
          },
        },
      };
    },
  });

  assert.deepEqual(readSnapshot({ trace, adapter }), {
    kind: "supported-map-page",
    mapView: {
      zoom: 17,
      centerLatLon: {
        lat: -1.21,
        lon: 36.83,
      },
    },
    viewportPx: {
      width: 700,
      height: 500,
    },
    viewportScreenPx: {
      x: 320,
      y: 70,
    },
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    },
    provenance: {
      activeEditor: "embedded-id-frame",
    },
  });
  assert.deepEqual(trace.edges, pageSnapshotReadEdges());
});

// Class-b: hash map view is a fallback. When visible map tiles and their
// surface transform give a more precise rendered center, the adapter exposes
// that precise map view instead of the coarse URL hash.
test("page observation derives a precise map view from rendered tiles", () => {
  const trace = createPageObservationTrace(
    "page observation derives a precise map view from rendered tiles",
  );
  const adapter = createPageSnapshotAdapter({
    readPage() {
      return {
        hash: "#map=16.00/-1.2284/36.8244",
        viewport: {
          width: 800,
          height: 600,
        },
        tileTransform: {
          x: 120,
          y: 140,
          scale: 2,
        },
        centerTile: {
          url: "https://tile.openstreetmap.org/3/4/5.png",
          tilePx: {
            width: 256,
            height: 256,
          },
        },
      };
    },
  });

  const snapshot = readSnapshot({ trace, adapter });

  assert.equal(snapshot.mapView.zoom, 4);
  assertLatLonClose(snapshot.mapView.centerLatLon, latLonFromWorld({
    x: 128 - (120 - 400) / 16,
    y: 160 - (140 - 300) / 16,
  }));
  assert.deepEqual(snapshot.provenance.mapView, {
    kind: "precise-rendered-tile",
  });
  assert.deepEqual(trace.edges, pageSnapshotReadEdges());
});

// Class-b: during active OSM surface motion, rendered tiles can temporarily
// stop describing a coherent map view. Observation retains the last coherent
// map view rather than falling back to a default or throwing.
test("page observation retains the last coherent map view during live surface motion", () => {
  const trace = createPageObservationTrace(
    "page observation retains the last coherent map view during live surface motion",
  );
  const pages = [
    {
      hash: "#map=16/-1.24401/36.82412",
      viewport: {
        width: 1280,
        height: 720,
      },
      tileTransform: {
        x: -240,
        y: -180,
        scale: 1,
      },
      surfaceMotion: {
        transformCss: "none",
        transformOriginCss: "0px 0px",
      },
    },
    {
      hash: "",
      viewport: {
        width: 1280,
        height: 720,
      },
      tileTransform: null,
      surfaceMotion: {
        transformCss: "matrix(1, 0, 0, 1, 18, -12)",
        transformOriginCss: "0px 0px",
      },
    },
  ];
  let index = 0;
  const adapter = createPageSnapshotAdapter({
    readPage() {
      return pages[index++];
    },
  });

  const coherent = readSnapshot({ trace, adapter, phase: "coherent" });
  const retained = readSnapshot({ trace, adapter, phase: "retained" });

  assert.deepEqual(retained.mapView, coherent.mapView);
  assert.deepEqual(retained.provenance.mapView, {
    kind: "retained-during-surface-motion",
  });
  assert.deepEqual(trace.edges, [
    ...pageSnapshotReadEdges("coherent"),
    ...pageSnapshotReadEdges("retained"),
  ]);
});

// Class-b: page observation is a live adapter, not just a one-off reader.
// History changes that alter the OSM map hash synchronously invalidate and
// publish a fresh snapshot.
test("page observation publishes a fresh snapshot when history changes the map hash", () => {
  const trace = createPageObservationTrace(
    "page observation publishes a fresh snapshot when history changes the map hash",
  );
  let hash = "#map=16/-1.22645/36.82597";
  let historyListener = null;
  const adapter = createPageSnapshotAdapter({
    readPage() {
      return {
        hash,
        viewport: {
          width: 900,
          height: 600,
        },
        tileTransform: {
          x: 0,
          y: 0,
          scale: 1,
        },
      };
    },
    observeHistory(listener) {
      historyListener = listener;
      return () => {
        historyListener = null;
      };
    },
  });
  const centers = [];

  trace.edge(flowEdge("source.page-observation.subscribe", "port.page-snapshot.subscribe", {
    provider: "page-observation-adapter",
  }));
  const unsubscribe = adapter.subscribe((snapshot) => {
    const phase = centers.length === 0 ? "initial" : "history-change";
    trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
      phase,
      provider: "page-observation-adapter",
    }));
    trace.edge(flowEdge("callback.live-map-snapshot", "sink.map-snapshot", {
      phase,
      terminal: "port-result",
    }));
    centers.push(snapshot.mapView.centerLatLon);
  });
  hash = "#map=16/-1.220000/36.830000";
  trace.edge(flowEdge("source.page-history-change", "callback.page-history-change", {
    provider: "page-observation-adapter",
  }));
  trace.edge(flowEdge("callback.page-history-change", "port.page-snapshot.subscribe", {
    provider: "page-observation-adapter",
  }));
  historyListener();

  assert.deepEqual(centers, [
    {
      lat: -1.22645,
      lon: 36.82597,
    },
    {
      lat: -1.22,
      lon: 36.83,
    },
  ]);

  unsubscribe();
  assert.deepEqual(trace.edges, [
    flowEdge("source.page-observation.subscribe", "port.page-snapshot.subscribe", {
      provider: "page-observation-adapter",
    }),
    flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
      phase: "initial",
      provider: "page-observation-adapter",
    }),
    flowEdge("callback.live-map-snapshot", "sink.map-snapshot", {
      phase: "initial",
      terminal: "port-result",
    }),
    flowEdge("source.page-history-change", "callback.page-history-change", {
      provider: "page-observation-adapter",
    }),
    flowEdge("callback.page-history-change", "port.page-snapshot.subscribe", {
      provider: "page-observation-adapter",
    }),
    flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
      phase: "history-change",
      provider: "page-observation-adapter",
    }),
    flowEdge("callback.live-map-snapshot", "sink.map-snapshot", {
      phase: "history-change",
      terminal: "port-result",
    }),
  ]);
});

function createPageObservationTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function readSnapshot({ trace, adapter, phase = undefined }) {
  return trace.withSource("source.page-snapshot-read", () => {
    trace.edge(flowEdge("source.page-snapshot-read", "port.page-snapshot.read", {
      ...edgePhase(phase),
      provider: "page-observation-adapter",
    }));
    const snapshot = adapter.readSnapshot();
    trace.edge(flowEdge("port.page-snapshot.read", "sink.map-snapshot", {
      ...edgePhase(phase),
      terminal: "port-result",
    }));
    return snapshot;
  });
}

function pageSnapshotReadEdges(phase = undefined) {
  return [
    flowEdge("source.page-snapshot-read", "port.page-snapshot.read", {
      ...edgePhase(phase),
      provider: "page-observation-adapter",
    }),
    flowEdge("port.page-snapshot.read", "sink.map-snapshot", {
      ...edgePhase(phase),
      terminal: "port-result",
    }),
  ];
}

function edgePhase(phase) {
  return phase === undefined ? {} : { phase };
}

function assertLatLonClose(actual, expected) {
  assert.equal(Math.abs(actual.lat - expected.lat) < 1e-9, true);
  assert.equal(Math.abs(actual.lon - expected.lon) < 1e-9, true);
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
