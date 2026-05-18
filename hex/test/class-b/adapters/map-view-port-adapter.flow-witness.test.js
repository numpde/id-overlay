import test from "node:test";
import assert from "node:assert/strict";

import {
  createOpenStreetMapMapViewPort,
} from "../../../adapters/page-osm-id/map-view-port-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: the OSM page adapter owns the concrete navigation mechanism. The
// shell supplies a semantic map view; the adapter writes the active editor hash,
// preferring the embedded iD frame when it is present.
test("map view port writes the embedded editor hash when centering the map", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "map view port writes the embedded editor hash when centering the map",
  });
  const ownerWindow = {
    location: {
      hash: "#map=9/23.45/120.53",
    },
  };
  const frameWindow = {
    location: {
      hash: "#map=9/23.57/120.63",
    },
  };
  const port = createOpenStreetMapMapViewPort({
    ownerWindow,
    findEmbeddedEditorFrame: () => ({
      contentWindow: frameWindow,
    }),
  });

  const result = port.setMapView({
    zoom: 10.5,
    centerLatLon: {
      lat: 23.123456789,
      lon: 120.987654321,
    },
  });

  assert.deepEqual(result, {
    kind: "set",
    hash: "#map=10.5/23.1234568/120.9876543",
  });
  assert.equal(ownerWindow.location.hash, "#map=9/23.45/120.53");
  assert.equal(frameWindow.location.hash, "#map=10.5/23.1234568/120.9876543");
  trace.edge(flowEdge("port.map-view.set", "sink.embedded-frame-location-hash", {
    terminal: "host-map-navigation",
  }));
});

// Class-b: top-level OSM edit pages have no frame boundary. The same semantic
// map view must still become an OSM-compatible hash without involving the
// application reducer.
test("map view port writes the top-level map hash without an embedded editor", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "map view port writes the top-level map hash without an embedded editor",
  });
  const ownerWindow = {
    location: {
      hash: "#background=standard",
    },
  };
  const port = createOpenStreetMapMapViewPort({
    ownerWindow,
  });

  const result = port.setMapView({
    zoom: 12,
    centerLatLon: {
      lat: -1.25,
      lon: 36.75,
    },
  });

  assert.deepEqual(result, {
    kind: "set",
    hash: "#background=standard&map=12/-1.25/36.75",
  });
  assert.equal(ownerWindow.location.hash, "#background=standard&map=12/-1.25/36.75");
  trace.edge(flowEdge("port.map-view.set", "sink.top-level-location-hash", {
    terminal: "host-map-navigation",
  }));
});
