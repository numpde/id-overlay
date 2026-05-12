import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Unclassified: proposal for the visible posture law. `Align` remains the
// product mode; temporary native-map access is a transient override layered on
// top of it. That prevents the shell from pretending the user switched to Trace
// while still making the overlay inert and pins hidden.
test("candidate: temporary native-map access overrides Align overlay input only", () => {
  const view = selectApplicationView({
    ...referenceImageLoadedState({
      mode: "align",
      pins: [firstPin()],
    }),
    inputOverride: {
      kind: "temporary-native-map-access",
    },
  });

  assert.equal(view.mode, "align");
  assert.equal(view.modeSwitch.selected, "align");
  assert.deepEqual(view.overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    reason: "temporary-native-map-access",
  });
  assert.deepEqual(view.overlay.pins, []);
});

// Unclassified: proposal for validity via transitions, not state-shape denial.
// In no-session or Trace, native-map access is already the visible posture, so
// the override is visually inert; the reducer can no-op or clear it, but the
// view must never show a second mode or expose Align-only affordances.
test("candidate: temporary native-map access is visually inert outside Align editing", () => {
  for (const state of [
    {
      inputOverride: {
        kind: "temporary-native-map-access",
      },
    },
    {
      ...referenceImageLoadedState({
        mode: "trace",
        pins: [firstPin()],
      }),
      inputOverride: {
        kind: "temporary-native-map-access",
      },
    },
  ]) {
    assert.deepEqual(selectApplicationView(state).overlayInput, {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
    });
  }
});

function referenceImageLoadedState({ mode, pins = [] }) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "data:image/png;base64,reference-image",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}
