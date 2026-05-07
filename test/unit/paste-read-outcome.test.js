import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createDecodedClipboardImageFact,
} from "../../src/core/clipboard-facts.js";
import {
  MACHINE_PASTE_READ_OUTCOME_KIND,
} from "../../src/core/machine/paste-read.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { createPagePlacedPasteReadOutcome } from "../../src/content/paste-read-outcome.js";
import { IMAGE } from "../helpers/session-fixtures.js";

const SNAPSHOT = Object.freeze({
  mapView: Object.freeze({
    center: Object.freeze({ lat: 12, lon: 34 }),
    zoom: 5,
  }),
});

test("page-placed paste outcome authors initial placement for decoded images", () => {
  const outcome = createPagePlacedPasteReadOutcome({
    fact: createDecodedClipboardImageFact({ image: IMAGE }),
    pageObservation: createPageObservation(),
  });

  assert.deepEqual(outcome, {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.DECODED_IMAGE,
    image: IMAGE,
    placement: createPlacementTransform({
      image: IMAGE,
      centerMapLatLon: SNAPSHOT.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: SNAPSHOT.mapView.zoom,
    }),
  });
});

test("page-placed paste outcome does not read page context for failures", () => {
  const outcome = createPagePlacedPasteReadOutcome({
    fact: createClipboardImageFailureFact({
      kind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
    }),
    pageObservation: {
      getSnapshot() {
        throw new Error("snapshot should not be read");
      },
    },
  });

  assert.deepEqual(outcome, {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE,
    failureKind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
  });
});

function createPageObservation() {
  return {
    getSnapshot() {
      return SNAPSHOT;
    },
  };
}
