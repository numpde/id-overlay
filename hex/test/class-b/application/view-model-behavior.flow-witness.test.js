import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: class-a owns the command transitions behind
// each action. This test protects the panel boundary: the view model exposes the
// primary action as semantic UI state, so adapters do not infer destructive or
// confirmation state from English copy.
test("view model exposes semantic primary action descriptors", () => {
  const trace = createViewTrace("view model exposes semantic primary action descriptors");
  const cases = [
    {
      state: {},
      primaryAction: {
        kind: "request-reference-image",
        label: "Paste",
        enabled: true,
        tone: "normal",
        confirmation: "none",
      },
    },
    {
      state: {
        referenceImageInput: {
          status: "awaiting-input",
          requestId: 1,
        },
      },
      primaryAction: {
        kind: "cancel-reference-image-input",
        label: "Cancel paste",
        enabled: true,
        tone: "normal",
        confirmation: "none",
      },
    },
    {
      state: referenceImageLoadedState(),
      primaryAction: {
        kind: "arm-clear-reference-image",
        label: "Clear image",
        enabled: true,
        tone: "normal",
        confirmation: "none",
      },
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
      }),
      primaryAction: {
        kind: "arm-clear-pins",
        label: "Clear pins",
        enabled: true,
        tone: "normal",
        confirmation: "none",
      },
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
        panelIntent: {
          kind: "confirm-clear-pins",
          requestId: 1,
        },
      }),
      primaryAction: {
        kind: "confirm-clear-pins",
        label: "Clear pins?",
        enabled: true,
        tone: "danger",
        confirmation: "armed",
      },
    },
    {
      state: referenceImageLoadedState({
        panelIntent: {
          kind: "confirm-clear-reference-image",
          requestId: 1,
        },
      }),
      primaryAction: {
        kind: "confirm-clear-reference-image",
        label: "Clear image?",
        enabled: true,
        tone: "danger",
        confirmation: "armed",
      },
    },
  ];

  assert.deepEqual(
    cases.map(({ state }) => selectApplicationView(state).primaryAction),
    cases.map(({ primaryAction }) => primaryAction),
  );
  traceViewProjection(trace, "primary-action-descriptors");
});

// Class-b: centering the overlay in the current map viewport is a secondary panel
// action. The view model exposes it as icon-addressable action state instead of
// making the panel infer availability from image copy or overlay markup.
test("view model exposes center-overlay action state", () => {
  const trace = createViewTrace("view model exposes center-overlay action state");
  const enabledAction = {
    kind: "center-overlay-in-view",
    label: "Center overlay in view",
    enabled: true,
    icon: "center-overlay",
  };
  const disabledAction = {
    ...enabledAction,
    enabled: false,
  };

  assert.deepEqual(selectApplicationView({}).centerOverlayInViewAction, disabledAction);
  assert.deepEqual(
    selectApplicationView(referenceImageLoadedState()).centerOverlayInViewAction,
    enabledAction,
  );
  assert.deepEqual(
    selectApplicationView(referenceImageLoadedState({
      placement: {
        x: 100,
        y: 200,
        scale: 1,
        rotationRad: 0,
        coordinateSpace: "map-world",
      },
    })).centerOverlayInViewAction,
    enabledAction,
  );
  assert.deepEqual(
    selectApplicationView(referenceImageLoadedState({
      mode: "trace",
      placement: {
        x: 100,
        y: 200,
        scale: 1,
        rotationRad: 0,
        coordinateSpace: "screen",
      },
    })).centerOverlayInViewAction,
    enabledAction,
  );
  assert.deepEqual(
    selectApplicationView(referenceImageLoadedState({
      mode: "trace",
      placement: {
        x: 100,
        y: 200,
        scale: 1,
        rotationRad: 0,
        coordinateSpace: "map-world",
      },
    })).centerOverlayInViewAction,
    disabledAction,
  );
  assert.deepEqual(
    selectApplicationView(referenceImageLoadedState({
      mode: "trace",
      pins: [firstPin(), secondPin()],
      solvedTransform: imageToMapWorldTransform(),
    })).centerOverlayInViewAction,
    disabledAction,
  );
  traceViewProjection(trace, "center-overlay-action");
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
    pins: labeledPins([firstPin()]),
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
    pins: labeledPins([firstPin()]),
    pageProjectionSource: {
      kind: "map-locked-placement",
      mode: "align",
    },
  });
  assert.deepEqual(view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
    pointerAffordances: {
      default: "native-map-pan",
      shift: "move-overlay",
      ctrl: "scale-overlay",
      alt: "rotate-overlay",
    },
  });
  traceViewProjection(trace, "align-live-map-surface-source");
});

// Class-b: durable pin ids are stable identities for commands/history/solver
// evidence. They are not user-facing ordinals. The view model must expose dense
// visible labels for the current pin set so removing old pins cannot leak gaps
// like 1, 2, 5, 6 into the UI.
test("view model exposes dense registration pin labels separate from durable ids", () => {
  const trace = createViewTrace("view model exposes dense registration pin labels separate from durable ids");
  const pins = [
    {
      ...firstPin(),
      id: 1,
    },
    {
      ...secondPin(),
      id: 2,
    },
    {
      ...thirdPin(),
      id: 5,
    },
    {
      ...fourthPin(),
      id: 6,
    },
  ];
  const view = selectApplicationView(referenceImageLoadedState({
    mode: "align",
    pins,
  }));

  assert.deepEqual(view.overlay.pins.map((pin) => ({
    id: pin.id,
    label: pin.label,
  })), [
    {
      id: 1,
      label: "1",
    },
    {
      id: 2,
      label: "2",
    },
    {
      id: 5,
      label: "3",
    },
    {
      id: 6,
      label: "4",
    },
  ]);
  traceViewProjection(trace, "dense-pin-labels");
});

// Class-b: pin color is selected from registration evidence before the UI
// adapter. A pin set that cannot be represented by one similarity transform is
// dangerous because accepting it would require warping the reference image; the
// adapter should only render the selected tone.
test("view model marks impossible registration pins as danger", () => {
  const trace = createViewTrace("view model marks impossible registration pins as danger");
  const pins = inconsistentPins();
  const view = selectApplicationView(referenceImageLoadedState({
    mode: "align",
    pins,
  }));

  assert.deepEqual(view.overlay.pins, pins.map((pin, index) => ({
    ...pin,
    label: String(index + 1),
    tone: "danger",
  })));
  traceViewProjection(trace, "impossible-registration-pin-tone");
});

// Class-b: the view model should use registration residual evidence, not a
// blanket "all pins are bad" tone, when three or more pins agree on one
// similarity and another pin is the visible outlier.
test("view model marks only incoherent registration pins as danger", () => {
  const trace = createViewTrace("view model marks only incoherent registration pins as danger");
  const pins = outlierPins();
  const view = selectApplicationView(referenceImageLoadedState({
    mode: "align",
    pins,
  }));

  assert.deepEqual(view.overlay.pins, [
    {
      ...pins[0],
      label: "1",
    },
    {
      ...pins[1],
      label: "2",
    },
    {
      ...pins[2],
      label: "3",
    },
    {
      ...pins[3],
      label: "4",
      tone: "danger",
    },
  ]);
  traceViewProjection(trace, "incoherent-registration-pin-tone");
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
    pointerAffordances: {
      default: "native-map-pass-through",
    },
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
          pinId: 5,
          pinLabel: "3",
        },
      }),
      status: "Added pin 3.",
    },
    {
      state: referenceImageLoadedState({
        pins: inconsistentPins(),
        notice: {
          kind: "added-pin",
          pinId: 3,
        },
      }),
      status: "Added pin 3. Pins cannot fit one transform; red pins need adjustment.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "removed-pin",
          pinId: 5,
          pinLabel: "3",
        },
      }),
      status: "Removed pin 3.",
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
      state: referenceImageLoadedState({
        notice: {
          kind: "placement-changed",
          editKind: "center-overlay",
        },
      }),
      status: "Overlay centered in view.",
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

function thirdPin() {
  return {
    id: 3,
    imagePx: {
      x: 420,
      y: 340,
    },
    mapLatLon: {
      lat: -1.24,
      lon: 36.85,
    },
  };
}

function fourthPin() {
  return {
    id: 4,
    imagePx: {
      x: 320,
      y: 340,
    },
    mapLatLon: {
      lat: -1.24,
      lon: 36.84,
    },
  };
}

function labeledPins(pins) {
  return pins.map((pin, index) => ({
    ...pin,
    label: String(index + 1),
  }));
}

function inconsistentPins() {
  return [
    {
      id: 1,
      imagePx: {
        x: 0,
        y: 0,
      },
      mapLatLon: {
        lat: 0,
        lon: -180,
      },
    },
    {
      id: 2,
      imagePx: {
        x: 100,
        y: 0,
      },
      mapLatLon: {
        lat: 0,
        lon: -178.59375,
      },
    },
    {
      id: 3,
      imagePx: {
        x: 0,
        y: 100,
      },
      mapLatLon: {
        lat: 0,
        lon: -180,
      },
    },
  ];
}

function outlierPins() {
  return [
    {
      id: 1,
      imagePx: {
        x: 0,
        y: 0,
      },
      mapLatLon: worldPointLatLon({
        x: 10,
        y: 20,
      }),
    },
    {
      id: 2,
      imagePx: {
        x: 100,
        y: 0,
      },
      mapLatLon: worldPointLatLon({
        x: 10,
        y: 220,
      }),
    },
    {
      id: 3,
      imagePx: {
        x: 0,
        y: 100,
      },
      mapLatLon: worldPointLatLon({
        x: -190,
        y: 20,
      }),
    },
    {
      id: 4,
      imagePx: {
        x: 100,
        y: 100,
      },
      mapLatLon: worldPointLatLon({
        x: 500,
        y: 500,
      }),
    },
  ];
}

function worldPointLatLon({ x, y }) {
  const lon = (x / 256) * 360 - 180;
  const mercator = 0.5 - y / 256;
  const latRad = 2 * Math.atan(Math.exp(mercator * 2 * Math.PI)) - Math.PI / 2;
  return {
    lat: (latRad * 180) / Math.PI,
    lon,
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
