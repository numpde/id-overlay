import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotAdapter,
  createProjectionAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: OSM/iD page scraping is an adapter
// strategy, not product law. The durable boundary is that dirty page handles
// are translated into browser-neutral plain map facts before entering the app.
test("page snapshot adapter emits plain map facts", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "page snapshot adapter emits plain map facts",
  });
  const adapter = createPageSnapshotAdapter({
    readPage() {
      return {
        rootHandle: new Map([["opaque", true]]),
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
      };
    },
  });

  const snapshot = trace.withSource("source.page-snapshot-read", () => {
    trace.edge(flowEdge("source.page-snapshot-read", "port.page-snapshot.read", {
      provider: "page-snapshot-adapter",
    }));
    const result = adapter.readSnapshot();
    trace.edge(flowEdge("port.page-snapshot.read", "sink.map-snapshot", {
      terminal: "port-result",
    }));
    return result;
  });

  assert.deepEqual(snapshot, {
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
    tileTransform: {
      x: -240,
      y: -180,
      scale: 1,
    },
  });
  assertPlainData(snapshot);
  assert.deepEqual(trace.edges, [
    flowEdge("source.page-snapshot-read", "port.page-snapshot.read", {
      provider: "page-snapshot-adapter",
    }),
    flowEdge("port.page-snapshot.read", "sink.map-snapshot", {
      terminal: "port-result",
    }),
  ]);
});

// Class-b, deliberately not class-a: map projection can be implemented many
// ways. The boundary promise is that expected misses cross inward as explicit
// plain failure facts, never as null guesses or page-adapter exceptions.
test("projection adapter reports explicit failure facts", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "projection adapter reports explicit failure facts",
  });
  const projection = createProjectionAdapter({
    readProjectionContext() {
      return {
        kind: "missing-viewport",
      };
    },
  });

  const result = trace.withSource("source.page-projection-request", () => {
    trace.edge(flowEdge("source.page-projection-request", "port.project-screen-point", {
      provider: "page-projection-adapter",
    }));
    const projected = projection.projectScreenPoint({
      screenPx: {
        x: 320,
        y: 240,
      },
    });
    trace.edge(flowEdge("port.project-screen-point", "sink.projection-result", {
      terminal: "port-result",
    }));
    return projected;
  });

  assert.deepEqual(result, {
    kind: "failed",
    reason: "missing-viewport",
  });
  assert.deepEqual(trace.edges, [
    flowEdge("source.page-projection-request", "port.project-screen-point", {
      provider: "page-projection-adapter",
    }),
    flowEdge("port.project-screen-point", "sink.projection-result", {
      terminal: "port-result",
    }),
  ]);
});

function assertPlainData(value) {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      assertPlainData(nestedValue);
    }
    return;
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return;
  }
  if (valueType === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }

  assert.equal(valueType, "object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(typeof key, "string");
    assertPlainData(nestedValue);
  }
}
