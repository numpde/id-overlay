import test from "node:test";
import assert from "node:assert/strict";

import { createPlacementTransform } from "../../src/core/transform.js";
import { createInitialPastePlacement } from "../../src/content/initial-paste-placement.js";
import { PAGE_SNAPSHOT_PROVENANCE_KIND } from "../../src/content/page-adapter/page-snapshot.js";
import { IMAGE } from "../helpers/session-fixtures.js";

const SNAPSHOT = Object.freeze({
  mapView: Object.freeze({
    center: Object.freeze({ lat: 12, lon: 34 }),
    zoom: 5,
  }),
});

test("initial paste placement authors placement from a live page snapshot", () => {
  const placement = createInitialPastePlacement({
    image: IMAGE,
    pageObservation: createPageObservation(),
  });

  assert.deepEqual(placement, createPlacementTransform({
    image: IMAGE,
    centerMapLatLon: SNAPSHOT.mapView.center,
    scale: 1,
    rotationRad: 0,
    zoom: SNAPSHOT.mapView.zoom,
  }));
});

test("initial paste placement does not read page context without an image", () => {
  const placement = createInitialPastePlacement({
    image: null,
    pageObservation: {
      getSnapshot() {
        throw new Error("snapshot should not be read");
      },
    },
  });

  assert.equal(placement, null);
});

test("initial paste placement rejects stale page snapshots", () => {
  const placement = createInitialPastePlacement({
    image: IMAGE,
    pageObservation: createPageObservation({
      provenance: { kind: PAGE_SNAPSHOT_PROVENANCE_KIND.STALE },
    }),
  });

  assert.equal(placement, null);
});

test("initial paste placement rejects synthetic page snapshots", () => {
  const placement = createInitialPastePlacement({
    image: IMAGE,
    pageObservation: createPageObservation({
      provenance: { kind: PAGE_SNAPSHOT_PROVENANCE_KIND.SYNTHETIC },
    }),
  });

  assert.equal(placement, null);
});

function createPageObservation(snapshot = SNAPSHOT) {
  return {
    getSnapshot() {
      return snapshot;
    },
  };
}
