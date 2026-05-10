import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Candidate: the primary button should expose the next user-visible action.
// These labels are product vocabulary, so they belong in the application view
// model, not in panel DOM code or browser shell glue.
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

// Candidate: history controls describe semantic user changes. The view model
// should read history records and expose labels; panel adapters should never
// synthesize generic Undo/Redo copy.
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

// Candidate: overlay rendering should be a pure projection from state. The
// adapter needs concrete facts, not permission to inspect session internals.
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

// Candidate: temporary pass-through is not a durable mode. It should override
// interaction ownership in the view while leaving the saved session mode alone.
test("view model exposes temporary pass-through as interaction posture", () => {
  assert.deepEqual(selectApplicationView({
    ...referenceImageLoadedState({
      mode: "align",
      pins: [firstPin()],
    }),
    inputOverride: {
      kind: "temporary-pass-through",
    },
  }).overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    reason: "temporary-pass-through",
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
