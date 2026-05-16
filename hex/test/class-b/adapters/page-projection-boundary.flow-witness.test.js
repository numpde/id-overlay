import test from "node:test";
import assert from "node:assert/strict";

import {
  createProjectionAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: page projection is deterministic over explicit input facts, not an
// ambient page query hidden behind the adapter.
test("projection adapter passes explicit projection inputs to the page projection service", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "projection adapter passes explicit projection inputs to the page projection service",
  });
  const calls = [];
  const request = {
    screenPx: {
      x: 320,
      y: 240,
    },
    projectionFacts: {
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
    },
  };
  const projection = createProjectionAdapter({
    readProjectionContext() {
      return {
        kind: "ready",
        projectScreenPoint(input) {
          calls.push(input);
          return {
            kind: "projected-map-point",
            mapLatLon: {
              lat: -1.25,
              lon: 36.83,
            },
          };
        },
      };
    },
  });

  const result = trace.withSource("source.page-projection-request", () => {
    trace.edge(flowEdge("source.page-projection-request", "port.project-screen-point", {
      provider: "page-projection-adapter",
    }));
    const projected = projection.projectScreenPoint(request);
    trace.edge(flowEdge("port.project-screen-point", "sink.projection-result", {
      terminal: "port-result",
    }));
    return projected;
  });

  assert.deepEqual(result, {
    kind: "projected-map-point",
    mapLatLon: {
      lat: -1.25,
      lon: 36.83,
    },
  });
  assert.deepEqual(calls, [request]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.page-projection-request", "port.project-screen-point", {
      provider: "page-projection-adapter",
    }),
    flowEdge("port.project-screen-point", "sink.projection-result", {
      terminal: "port-result",
    }),
  ]);
});
