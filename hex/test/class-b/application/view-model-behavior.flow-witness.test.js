import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: class-a owns the no-session Paste law and
// the command transitions behind each action. This test protects the current
// panel vocabulary plus one ownership boundary: adapters render the primary
// action selected by the view model instead of inventing button copy locally.
test("view model exposes primary action labels for each product posture", () => {
  const trace = createViewTrace("view model exposes primary action labels for each product posture");
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
  traceViewProjection(trace, "primary-action-labels");
});

// Class-b, deliberately not class-a: exact history wording may be tuned. What
// is settled is the boundary: panels render application-selected undo/redo
// affordances and do not invent generic Undo/Redo copy locally.
test("view model exposes semantic history controls", () => {
  const trace = createViewTrace("view model exposes semantic history controls");
  const view = selectApplicationView({
    ...referenceImageLoadedState(),
    history: {
      past: [{
        kind: "remove-reference-image",
        before: {
          session: referenceImageLoadedState().session,
        },
        after: null,
      }],
      future: [{
        kind: "replace-reference-image",
        before: {
          session: referenceImageLoadedState().session,
        },
        after: {
          session: referenceImageLoadedState({
            referenceImageId: "replacement-image-data",
          }).session,
        },
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
      label: "Replace image",
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
  traceViewProjection(trace, "semantic-history-controls");
});

// Class-b: panel controls render view facts selected by the application view
// model. A loaded image session must expose the current opacity and enabled
// opacity affordance; otherwise the UI can show a disabled default that
// disagrees with the visible overlay.
test("view model exposes opacity control from the current image session", () => {
  const trace = createViewTrace("view model exposes opacity control from the current image session");

  assert.deepEqual(selectApplicationView({}).opacityControl, {
    value: 1,
    min: 0,
    max: 1,
    step: 0.01,
    enabled: false,
  });
  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    opacity: 0.76,
  })).opacityControl, {
    value: 0.76,
    min: 0,
    max: 1,
    step: 0.01,
    enabled: true,
  });
  traceViewProjection(trace, "opacity-control");
});

// Class-b, deliberately not class-a: class-a owns the visible law that Trace
// hides pins. This protects the adapter contract shape: overlay adapters receive
// durable render facts, not renderer-owned resource cache fields.
test("view model exposes overlay render facts", () => {
  const trace = createViewTrace("view model exposes overlay render facts");
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
  traceViewProjection(trace, "overlay-render-facts");
});

// Class-b: Trace rendering has one map-lock contract. A registration solve may
// have authored the placement, but the view should not expose a separate
// solved-rendering path from hand placement.
test("view model exposes Trace solved placement through the same map-lock source", () => {
  const trace = createViewTrace("view model exposes Trace solved placement through the same map-lock source");
  const solvedTransform = imageToMapWorldTransform();
  const view = selectApplicationView(referenceImageLoadedState({
    mode: "trace",
    pins: [firstPin(), secondPin()],
    solvedTransform,
  }));

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement: placementFromSolvedTransform(solvedTransform),
    opacity: 1,
    pins: [],
    pageProjectionSource: {
      kind: "map-locked-placement",
      mode: "trace",
    },
  });
  assert.equal(JSON.stringify(view.overlay).includes("surfaceMotion"), false);
  assert.equal(JSON.stringify(view.overlay).includes("viewport"), false);
  assert.equal(JSON.stringify(view.overlay).includes("image-to-map-world-transform"), false);
  traceViewProjection(trace, "trace-solved-map-lock-source");
});

// Class-b: Trace is map-locked viewing even before registration pins exist,
// once placement has been normalized into the map-world coordinate space. The
// application stays host-neutral by exposing only the need for live map surface
// projection; page snapshots and CSS motion remain adapter facts.
test("view model exposes Trace map-surface overlay source without pins", () => {
  const trace = createViewTrace("view model exposes Trace map-surface overlay source without pins");
  const placement = mapWorldPlacement(movedPlacement());
  const view = selectApplicationView(referenceImageLoadedState({
    mode: "trace",
    placement,
  }));

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement,
    opacity: 1,
    pins: [],
    pageProjectionSource: {
      kind: "map-locked-placement",
      mode: "trace",
    },
  });
  assert.equal(JSON.stringify(view.overlay).includes("surfaceMotion"), false);
  assert.equal(JSON.stringify(view.overlay).includes("viewport"), false);
  traceViewProjection(trace, "trace-live-map-surface-source");
});

// Class-b: Align is the editing posture, not a different coordinate system.
// When placement is map-locked, Align must still ask the page projection
// boundary for screen rendering so the image pans and zooms with the map while
// keeping pins editable.
test("view model exposes Align map-surface overlay source with pins", () => {
  const trace = createViewTrace("view model exposes Align map-surface overlay source with pins");
  const placement = mapWorldPlacement(movedPlacement());
  const view = selectApplicationView(referenceImageLoadedState({
    mode: "align",
    placement,
    pins: [firstPin()],
  }));

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement,
    opacity: 1,
    pins: [firstPin()],
    pageProjectionSource: {
      kind: "map-locked-placement",
      mode: "align",
    },
  });
  assert.deepEqual(view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });
  traceViewProjection(trace, "align-live-map-surface-source");
});

// Class-b, deliberately not class-a: this is view-model projection of a class-a
// app state law. The view model is the SSoT for visible posture, so overlay
// interactivity and rendered pins must agree; adapters must not reconcile
// contradictory view facts.
test("view model exposes temporary native-map access as interaction posture", () => {
  const trace = createViewTrace("view model exposes temporary native-map access as interaction posture");
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
  traceViewProjection(trace, "temporary-native-map-access");
});

// Class-b, deliberately not class-a: these are user-facing strings and status
// precedence choices, so they may be tuned. The settled boundary is ownership:
// the view model composes status copy from application facts, and panel adapters
// render that selected string rather than inventing status locally.
test("view model exposes user-visible status copy", () => {
  const trace = createViewTrace("view model exposes user-visible status copy");

  for (const { state, status } of [
    {
      state: {},
      status: "Paste a screenshot to begin.",
    },
    {
      state: referenceImageLoadedState(),
      status: "Align image to the map.",
    },
    {
      state: referenceImageLoadedState({ mode: "trace" }),
      status: "Trace using the aligned image.",
    },
    {
      state: referenceImageLoadedState({
        panelIntent: {
          kind: "confirm-clear-reference-image",
        },
      }),
      status: "Click Clear image? again to remove the current screenshot, placement, and pins.",
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
        panelIntent: {
          kind: "confirm-clear-pins",
        },
      }),
      status: "Click Clear pins? again to remove the current registration pins.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "reference-image-loaded",
          referenceImage: normalizedReferenceImage(),
        },
      }),
      status: "Loaded screenshot 640x480.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "reference-image-cleared",
        },
      }),
      status: `${["Im", "age"].join("")} cleared.`,
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "mode-selected",
          mode: "trace",
        },
      }),
      status: "Switched to trace.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "added-pin",
          pinId: 1,
        },
      }),
      status: "Added pin 1.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "removed-pin",
          pinId: 1,
        },
      }),
      status: "Removed pin 1.",
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
        notice: {
          kind: "overlay-fitted",
          pinCount: 2,
        },
      }),
      status: "Fit overlay from 2 pins.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "placement-changed",
          editKind: "move",
        },
      }),
      status: "Moved overlay.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "placement-changed",
          editKind: "rotate",
        },
      }),
      status: "Rotated overlay.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "placement-changed",
          editKind: "scale",
        },
      }),
      status: "Scaled overlay.",
    },
    {
      state: {
        referenceImageInput: {
          status: "awaiting-input",
          requestId: 1,
        },
      },
      status: "Press Ctrl/Cmd+V to paste an image from your clipboard.",
    },
    {
      state: {
        notice: {
          kind: "reference-image-input-empty",
        },
      },
      status: "Clipboard does not contain an image.",
    },
    {
      state: {
        notice: {
          kind: "reference-image-replacement-empty",
        },
      },
      status: "Clipboard does not contain an image.",
    },
    {
      state: {
        notice: {
          kind: "reference-image-input-failed",
          reason: "decode-failed",
        },
      },
      status: "Clipboard image could not be read.",
    },
    {
      state: {
        notice: {
          kind: "reference-image-replacement-failed",
          reason: "source-unavailable",
        },
      },
      status: "Clipboard image could not be loaded.",
    },
    {
      state: {
        notice: {
          kind: "reference-image-input-cancelled",
        },
      },
      status: "Paste cancelled.",
    },
    {
      state: {
        notice: {
          kind: "history-empty",
          direction: "undo",
        },
      },
      status: "Nothing to undo.",
    },
    {
      state: {
        notice: {
          kind: "history-empty",
          direction: "redo",
        },
      },
      status: "Nothing to redo.",
    },
  ]) {
    assert.equal(selectApplicationView(state).status, status);
  }
  traceViewProjection(trace, "status-copy");
});

function createViewTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceViewProjection(trace, phase) {
  trace.edge(flowEdge("view.application-state", "sink.application-view", {
    phase,
    terminal: "view-result",
  }));
}

function referenceImageLoadedState({
  mode = "align",
  referenceImageId = "reference-image-data-1",
  placement,
  opacity,
  pins = [],
  solvedTransform,
  panelIntent = null,
  notice = null,
} = {}) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: referenceImageId,
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
  if (pins.length > 0 || solvedTransform !== undefined) {
    session.registration = {
      pins,
    };
    if (solvedTransform !== undefined) {
      session.registration.solvedTransform = solvedTransform;
    }
  }
  return {
    session,
    ...(panelIntent === null ? {} : { panelIntent }),
    ...(notice === null ? {} : { notice }),
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function imageToMapWorldTransform() {
  return {
    type: "image-to-map-world",
    a: 1,
    b: 0,
    tx: 100,
    ty: 200,
    scale: 1,
    rotationRad: 0,
    pinIds: [1, 2],
  };
}

function placementFromSolvedTransform(transform) {
  return {
    x: transform.tx,
    y: transform.ty,
    scale: transform.scale,
    rotationRad: transform.rotationRad,
    coordinateSpace: "map-world",
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

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 420,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.85,
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

function mapWorldPlacement(placement) {
  return {
    ...placement,
    coordinateSpace: "map-world",
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
