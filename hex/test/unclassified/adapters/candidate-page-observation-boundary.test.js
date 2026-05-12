import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Unclassified candidate: observation is a fact boundary, not an exception
// boundary. A supported page can temporarily lack a usable map hash during OSM
// navigation; that must cross inward as a plain unavailable observation.
test("page observation reports missing map view as an explicit unavailable fact", () => {
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

  assert.deepEqual(adapter.readSnapshot(), {
    kind: "unavailable-map-snapshot",
    reason: "missing-map-view",
  });
});

// Unclassified candidate: page observation may expose browser-neutral map
// facts, but it must not leak OSM/DOM handles inward. That keeps the app free
// to be tested without browser objects and prevents hidden adapter authority.
test("page observation output remains plain data even when the page reader sees handles", () => {
  const adapter = createPageSnapshotAdapter({
    readPage() {
      return {
        rootHandle: new Map([["opaque", true]]),
        hash: "#map=16/-1.24401/36.82412",
        viewport: {
          element: {
            nodeType: 1,
          },
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

  assertPlainData(adapter.readSnapshot());
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
