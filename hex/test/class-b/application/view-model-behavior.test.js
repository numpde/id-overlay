import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Class-b, deliberately not class-a: class-a owns the no-session Paste law and
// the command transitions behind each action. This test protects the current
// panel vocabulary plus one ownership boundary: adapters render the primary
// action selected by the view model instead of inventing button copy locally.
test("view model exposes primary action labels for each product posture", () => {
  const cases = [
    {
      state: {},
      label: "Paste",
    },
    {
      state: {
        referenceImageInput: {
          status: "awaiting-input",
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
          requestId: 1,
        },
      }),
      label: "Clear pins?",
    },
    {
      state: referenceImageLoadedState({
        panelIntent: {
          kind: "confirm-clear-reference-image",
          requestId: 1,
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

// Class-b, deliberately not class-a: exact history wording may be tuned. What
// is settled is the boundary: panels render application-selected undo/redo
// affordances and do not invent generic Undo/Redo copy locally.
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

  const placementView = selectApplicationView({
    ...referenceImageLoadedState({
      placement: movedPlacement(),
    }),
    history: {
      past: [placementHistoryRecord({
        editKind: "move",
        before: placementRevision({
          placement: originalPlacement(),
          solvedRegistration: null,
        }),
        after: placementRevision({
          placement: movedPlacement(),
          solvedRegistration: null,
        }),
      })],
      future: [placementHistoryRecord({
        editKind: "rotate",
        before: placementRevision({
          placement: movedPlacement(),
          solvedRegistration: null,
        }),
        after: placementRevision({
          placement: rotatedPlacement(),
          solvedRegistration: null,
        }),
      })],
    },
  });

  assert.match(placementView.history.undo.label, /\bmove\b/i);
  assert.match(placementView.history.undo.label, /\boverlay\b/i);
  assert.match(placementView.history.redo.label, /\brotate\b/i);
  assert.match(placementView.history.redo.label, /\boverlay\b/i);
  assert.notEqual(placementView.history.undo.label, "Undo");
  assert.notEqual(placementView.history.redo.label, "Redo");
});

// Class-b, deliberately not class-a: class-a owns the visible law that Trace
// hides pins. This protects the adapter contract shape: overlay adapters receive
// durable render facts, not renderer-owned resource cache fields.
test("view model exposes overlay render facts", () => {
  const placement = {
    x: 80,
    y: 40,
    scale: 1.5,
    rotationRad: 0.2,
  };

  const view = selectApplicationView({
    ...referenceImageLoadedState({
      placement,
      opacity: 0.6,
      pins: [firstPin()],
    }),
    runtimeImageResource: {
      imageDataRef: "reference-image-data-1",
      objectUrl: "blob:https://www.openstreetmap.org/runtime-only",
    },
  });

  assert.deepEqual(view.overlay, {
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
  assert.equal(JSON.stringify(view).includes("objectUrl"), false);
  assert.equal(JSON.stringify(view).includes("blob:"), false);
});

// Class-b, deliberately not class-a: temporary pass-through is transient input
// posture, not durable product mode. This protects the view-model boundary:
// adapters render derived interaction facts instead of inspecting Align
// internals.
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

// Class-b, deliberately not class-a: these are user-facing strings and status
// precedence choices, so they may be tuned. The settled boundary is ownership:
// the view model composes status copy from application facts, and panel adapters
// render that selected string rather than inventing status locally.
test("view model exposes user-visible status copy", () => {
  for (const { state, status } of [
    {
      state: referenceImageLoadedState(),
      status: "Loaded screenshot 640x480.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "cleared-pins",
          count: 1,
        },
      }),
      status: "Cleared 1 pin.",
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
        panelIntent: {
          kind: "confirm-clear-pins",
        },
      }),
      status: "Click Clear pins? again to remove 1 pin.",
    },
    {
      state: {
      notice: {
        kind: "reference-image-input-empty",
      },
      },
      status: "Clipboard does not contain an image.",
    },
  ]) {
    assert.equal(selectApplicationView(state).status, status);
  }
});

function referenceImageLoadedState({
  mode = "align",
  placement,
  opacity,
  pins = [],
  panelIntent = null,
  notice = null,
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
    ...(notice === null ? {} : { notice }),
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

function placementHistoryRecord({ editKind, before, after }) {
  return {
    kind: "overlay-placement-edit",
    editKind,
    before,
    after,
  };
}

function placementRevision({ placement, solvedRegistration }) {
  return {
    placement,
    solvedRegistration,
  };
}

function originalPlacement() {
  return {
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0,
  };
}

function movedPlacement() {
  return {
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0,
  };
}

function rotatedPlacement() {
  return {
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0.5,
  };
}
