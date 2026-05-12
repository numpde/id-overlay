import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Class-c: page observation should report expected OSM navigation gaps as data,
// not adapter exceptions. Current code still parses the hash unsafely inside a
// monolithic page adapter, so this remains quarantined until observation is its
// own port with explicit unavailable facts.
//
// Decision: keep only this failing pressure. Plain-data snapshot output is
// already covered by class-b page-adapter tests, so duplicating it here would
// make the quarantine noisier without strengthening the target shape.
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
