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

// Class-b, not class-a: exact labels and record fields are still product-copy
// choices, but the ownership is not. Panels render semantic history controls
// selected from application state; they do not invent generic Undo/Redo text.
test("view model exposes semantic history controls", () => {
  const view = selectApplicationView({
    ...referenceImageLoadedState(),
    history: {
      past: [{
        kind: "remove-reference-image",
        undoLabel: "Reload image",
        redoLabel: "Remove image",
      }],
      future: [{
        kind: "move-overlay",
        undoLabel: "Undo move overlay",
        redoLabel: "Redo move overlay",
      }],
    },
  });

  assert.deepEqual(view.history, {
    undo: {
      enabled: true,
      label: "Reload image",
    },
    redo: {
      enabled: true,
      label: "Redo move overlay",
    },
  });
  assert.notEqual(view.history.undo.label, "Undo");
  assert.notEqual(view.history.redo.label, "Redo");
});

// Class-b, not class-a: overlay rendering needs a stable plain-data projection,
// but the final renderer may rename individual fields. The key boundary is
// that adapters receive render facts instead of reading session internals.
test("view model exposes overlay render facts", () => {
  const placement = {
    x: 80,
    y: 40,
    scale: 1.5,
    rotationRad: 0.2,
  };

  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    placement,
    opacity: 0.6,
    pins: [firstPin()],
  })).overlay, {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement,
    opacity: 0.6,
    pins: [firstPin()],
  });
});

function referenceImageLoadedState({
  mode = "align",
  placement,
  opacity,
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
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
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
