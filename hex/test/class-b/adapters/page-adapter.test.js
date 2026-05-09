import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Class-b: the page adapter is allowed to inspect dirty page handles, but its
// snapshot output must be browser-neutral plain map data.
test("page snapshot adapter emits plain map facts", () => {
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

  const snapshot = adapter.readSnapshot();

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
