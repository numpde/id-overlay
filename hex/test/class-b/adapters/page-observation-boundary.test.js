import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Class-b: expected OSM navigation gaps are adapter facts, not adapter
// exceptions.
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
