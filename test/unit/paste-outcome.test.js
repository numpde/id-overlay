import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createClipboardUnavailableFact,
  createDecodedClipboardImageFact,
} from "../../src/core/clipboard-facts.js";
import {
  MACHINE_PASTE_READ_OUTCOME_KIND,
  createPasteReadOutcomeFromClipboardFact,
} from "../../src/core/machine/paste-outcome.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { IMAGE } from "../helpers/session-fixtures.js";

const SNAPSHOT = Object.freeze({
  viewportRect: Object.freeze({ left: 0, top: 0, width: 800, height: 400 }),
  mapView: Object.freeze({
    center: Object.freeze({ lat: 12, lon: 34 }),
    zoom: 5,
  }),
});

test("decoded clipboard image fact becomes a paste outcome with canonical initial placement", () => {
  const outcome = createPasteReadOutcomeFromClipboardFact({
    fact: createDecodedClipboardImageFact({ image: IMAGE }),
    snapshot: SNAPSHOT,
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

test("clipboard failure facts become paste failure outcomes", () => {
  assert.deepEqual(createPasteReadOutcomeFromClipboardFact({
    fact: createClipboardImageFailureFact({
      kind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
    }),
    snapshot: SNAPSHOT,
  }), {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE,
    failureKind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
  });

  assert.deepEqual(createPasteReadOutcomeFromClipboardFact({
    fact: createClipboardImageFailureFact({
      kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
    }),
    snapshot: SNAPSHOT,
  }), {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE,
    failureKind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
  });
});

test("clipboard unavailable fact keeps paste armed for manual paste fallback", () => {
  assert.equal(createPasteReadOutcomeFromClipboardFact({
    fact: createClipboardUnavailableFact(),
    snapshot: SNAPSHOT,
  }), null);
});
