import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Class-b, not class-a: the exact button copy can be tuned, but the ownership
// is settled enough to enforce here. The application view model names the next
// user-visible primary action; panel adapters only render that label.
test("view model exposes primary action labels for each product posture", () => {
  const cases = [
    {
      state: {},
      label: "Paste",
    },
    {
      state: {
        referenceImageInput: {
          status: "awaiting-paste",
          requestId: 1,
        },
      },
      label: "Cancel paste",
    },
    {
      state: referenceImageLoadedState(),
      label: "Clear image",
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
      }),
      label: "Clear pins",
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
        panelIntent: {
          kind: "confirm-clear-pins",
        },
      }),
      label: "Clear pins?",
    },
    {
      state: referenceImageLoadedState({
        panelIntent: {
          kind: "confirm-clear-reference-image",
        },
      }),
      label: "Clear image?",
    },
  ];

  assert.deepEqual(
    cases.map(({ state }) => selectApplicationView(state).primaryAction.label),
    cases.map(({ label }) => label),
  );
});

function referenceImageLoadedState({
  mode = "align",
  pins = [],
  panelIntent = null,
} = {}) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "reference-image-data-1",
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
    ...(panelIntent === null ? {} : { panelIntent }),
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
