import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_FEEDBACK_ACTION,
  describePanelActionPresentation,
  describeRuntimeErrorPresentation,
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
  resolveOverlayRenderPresentation,
  resolveRegistrationSolvePresentation,
  resolveOverlaySessionPresentation,
} from "../../src/core/presentation.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";
import { projectLiveUiState } from "../../src/core/ui-live-state.js";
import {
  CLEAR_PINS_CONFIRMATION_MESSAGE,
  CLEAR_IMAGE_CONFIRMATION_MESSAGE,
  MANUAL_PASTE_PROMPT,
  resolveUiStatusBaseline,
} from "../../src/core/ui-status-model.js";
import { resolveUiViewModel } from "../../src/core/ui-view-model.js";
import { UI_PANEL_INTENT_KIND } from "../../src/core/ui-state-model.js";

function resolvePanelViewModel({ state, panelActionState }) {
  return resolveUiViewModel({
    uiState: projectLiveUiState({
      state,
      panelActionState,
    }),
  });
}

function resolvePanelPresentation(input) {
  return resolvePanelViewModel(input);
}

function resolveStatusBaseline({ state, runtime, panelActionState = { kind: UI_PANEL_INTENT_KIND.IDLE } }) {
  return resolveUiStatusBaseline({
    uiState: projectLiveUiState({
      state,
      runtime,
      panelActionState,
    }),
  });
}

test("resolveOverlaySessionPresentation centralizes session labels and enablement", () => {
  const empty = resolveOverlaySessionPresentation({
    image: null,
    mode: "trace",
    registration: {
      pins: [],
      solvedTransform: null,
      dirty: false,
    },
  });

  assert.equal(empty.hasImage, false);
  assert.equal(empty.canPasteImage, true);
  assert.equal(empty.canShowPins, false);
  assert.equal(empty.pinCount, 0);
  assert.equal(empty.canClearPins, false);
  assert.equal(empty.solve.summaryLabel, "No pins yet");
  assert.equal(empty.render.label, "No image");

  const solved = resolveOverlaySessionPresentation({
    image: { src: "x", width: 1, height: 1 },
    mode: "trace",
    registration: {
      pins: [
        { id: 1, imagePx: { x: 1, y: 2 }, mapLatLon: { lat: 1, lon: 2 } },
        { id: 2, imagePx: { x: 3, y: 4 }, mapLatLon: { lat: 3, lon: 4 } },
      ],
      solvedTransform: {
        type: "similarity",
        a: 1,
        b: 0,
        tx: 0,
        ty: 0,
        pinCount: 2,
      },
      dirty: false,
    },
  });

  assert.equal(solved.hasImage, true);
  assert.equal(solved.canPasteImage, false);
  assert.equal(solved.canShowPins, false);
  assert.equal(solved.pinCount, 2);
  assert.equal(solved.canClearPins, false);
  assert.equal(solved.solve.summaryLabel, "Solved from 2 pin(s)");
  assert.equal(solved.render.label, "Solved transform active");
});

test("presentation centralizes solve and render copy from semantic state", () => {
  assert.deepEqual(resolveRegistrationSolvePresentation({
    pins: [],
    solvedTransform: null,
    dirty: false,
  }), {
    kind: "empty",
    pinCount: 0,
    solvedPinCount: 0,
    canCompute: false,
    summaryLabel: "No pins yet",
    statusMessage: null,
  });

  assert.deepEqual(resolveRegistrationSolvePresentation({
    pins: [{ id: 1 }],
    solvedTransform: null,
    dirty: true,
  }), {
    kind: "insufficient-pins",
    pinCount: 1,
    solvedPinCount: 1,
    canCompute: false,
    summaryLabel: "Collect at least 2 pins",
    statusMessage: null,
  });

  assert.deepEqual(resolveRegistrationSolvePresentation({
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: null,
    dirty: true,
  }), {
    kind: "dirty",
    pinCount: 2,
    solvedPinCount: 2,
    canCompute: true,
    summaryLabel: "Pins changed; fit pending",
    statusMessage: "Align mode: pins changed. Switch to Trace to fit the overlay from the current pins.",
  });

  assert.deepEqual(resolveRegistrationSolvePresentation({
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0, pinCount: 3 },
    dirty: false,
  }), {
    kind: "solved",
    pinCount: 2,
    solvedPinCount: 3,
    canCompute: true,
    summaryLabel: "Solved from 3 pin(s)",
    statusMessage: null,
  });

  assert.deepEqual(resolveOverlayRenderPresentation({
    image: null,
    mode: "trace",
    registration: { solvedTransform: null, dirty: false },
  }), {
    hasImage: false,
    source: "none",
    label: "No image",
    message: "Paste a screenshot to begin.",
  });

  assert.deepEqual(resolveOverlayRenderPresentation({
    image: { width: 1, height: 1 },
    mode: "trace",
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: false },
  }), {
    hasImage: true,
    source: "solved",
    label: "Solved transform active",
    message: "Trace mode: the overlay follows the map using the solved transform.",
  });
});

test("resolveUiStatusBaseline centralizes runtime-aware status copy", () => {
  assert.equal(
    resolveStatusBaseline({
      state: { image: null, mode: "trace", registration: { pins: [], solvedTransform: null, dirty: false } },
      runtime: {},
    }),
    "Paste a screenshot to begin.",
  );

  const solvedAlignState = {
    image: { src: "x", width: 1, height: 1 },
    mode: "align",
    registration: {
      pins: [],
      solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
      dirty: false,
    },
  };

  assert.equal(
    resolveStatusBaseline({
      state: solvedAlignState,
      runtime: { isPassThroughActive: true, pointerScreenPx: null, dragMode: null },
    }),
    "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.",
  );

  assert.equal(
    resolveStatusBaseline({
      state: solvedAlignState,
      runtime: { isPassThroughActive: false, pointerScreenPx: null, dragMode: "map-pan" },
    }),
    "Panning the map while the overlay follows.",
  );
});

test("resolvePanelPresentation centralizes panel labels and enablement through the canonical main-action descriptor", () => {
  const presentation = resolvePanelPresentation({
    state: {
      image: { src: "x", width: 1, height: 1 },
      mode: "align",
      opacity: 0.75,
      registration: {
        pins: [
          { id: 1, imagePx: { x: 1, y: 2 }, mapLatLon: { lat: 1, lon: 2 } },
          { id: 2, imagePx: { x: 3, y: 4 }, mapLatLon: { lat: 3, lon: 4 } },
        ],
        solvedTransform: null,
        dirty: false,
      },
    },
    panelActionState: {
      kind: UI_PANEL_INTENT_KIND.PASTE_ARMED,
      sessionId: 1,
    },
  });

  assert.deepEqual(presentation, {
    opacityValue: "0.75",
    modeSwitch: {
      checked: true,
      disabled: false,
    },
    mainAction: {
      hasImage: true,
      pinCount: 2,
      intent: UI_PANEL_INTENT_KIND.IDLE,
      target: "clear-pins",
      shouldReset: true,
      disabled: false,
      label: "Clear 2 pins",
      presentationKind: "neutral",
    },
  });
});

test("resolvePanelPresentation advances the primary action to clear-image when pins are not clearable", () => {
  const viewModel = resolvePanelViewModel({
    state: {
      image: { src: "x", width: 1, height: 1 },
      mode: "trace",
      opacity: 0.6,
      registration: {
        pins: [
          { id: 1, imagePx: { x: 1, y: 2 }, mapLatLon: { lat: 1, lon: 2 } },
          { id: 2, imagePx: { x: 3, y: 4 }, mapLatLon: { lat: 3, lon: 4 } },
        ],
        solvedTransform: null,
        dirty: false,
      },
    },
    panelActionState: {
      kind: UI_PANEL_INTENT_KIND.IDLE,
      sessionId: 0,
    },
  });
  assert.equal(viewModel.mainAction.target, "clear-image");
  assert.equal(viewModel.mainAction.label, "Clear image");
  assert.equal(viewModel.mainAction.disabled, false);
  assert.equal(viewModel.modeSwitch.disabled, false);
});

test("resolvePanelViewModel keeps panel semantics on the main-action image source", () => {
  const viewModel = resolvePanelViewModel({
    state: {
      image: null,
      mode: "align",
      opacity: 0.6,
      registration: {
        pins: [],
        solvedTransform: null,
        dirty: false,
      },
    },
    panelActionState: {
      kind: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
      sessionId: 0,
    },
  });

  assert.equal(viewModel.mainAction.hasImage, false);
  assert.equal(viewModel.mainAction.disabled, false);
  assert.equal(viewModel.mainAction.label, "Paste");
  assert.equal(viewModel.mainAction.shouldReset, true);
  assert.equal(viewModel.modeSwitch.disabled, true);
});

test("resolvePanelPresentation keeps confirmation labels aligned with canonical status prompts", () => {
  const pinsPresentation = resolvePanelPresentation({
    state: {
      image: { src: "x", width: 1, height: 1 },
      mode: "align",
      opacity: 0.6,
      registration: {
        pins: [{ id: 1 }],
        solvedTransform: null,
        dirty: false,
      },
    },
    panelActionState: {
      kind: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
      sessionId: 0,
    },
  });

  assert.equal(pinsPresentation.mainAction.label, "Clear pins?");
  assert.equal(pinsPresentation.mainAction.presentationKind, "confirm");

  const imagePresentation = resolvePanelPresentation({
    state: {
      image: { src: "x", width: 1, height: 1 },
      mode: "align",
      opacity: 0.6,
      registration: {
        pins: [],
        solvedTransform: null,
        dirty: false,
      },
    },
    panelActionState: {
      kind: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
      sessionId: 0,
    },
  });

  assert.equal(imagePresentation.mainAction.label, "Clear image?");
  assert.equal(imagePresentation.mainAction.presentationKind, "confirm");
  assert.notEqual(CLEAR_PINS_CONFIRMATION_MESSAGE, CLEAR_IMAGE_CONFIRMATION_MESSAGE);
  assert.equal(MANUAL_PASTE_PROMPT.startsWith("Press"), true);
});

test("presentation helpers centralize pin and solve feedback copy", () => {
  assert.equal(
    describePinResultPresentation({ ok: true, action: "added", pin: { id: 3 } }),
    "Added pin 3.",
  );
  assert.equal(
    describePinResultPresentation({ ok: false, reason: "pointer-outside-image" }),
    "Move the pointer over the screenshot before adding a pin.",
  );
  assert.equal(
    describeSolveResultPresentation({ ok: true, pinCount: 3 }),
    "Computed transform from 3 pin(s).",
  );
  assert.equal(
    describeSolveResultPresentation({ ok: false, reason: "insufficient-pins", pinCount: 1 }),
    "Need at least 2 pins to compute a transform. Current pins: 1.",
  );
  assert.equal(
    describeInteractionEventPresentation({ type: "pins-cleared" }),
    "Cleared all registration pins.",
  );
});

test("runtime error presentation is centralized", () => {
  assert.equal(
    describeRuntimeErrorPresentation({
      source: RUNTIME_ERROR_SOURCE.OVERLAY,
      message: "ignored",
    }),
    "The overlay gesture failed. Try the action again.",
  );
  assert.equal(
    describeInteractionEventPresentation({
      type: "runtime-error",
      error: {
        source: RUNTIME_ERROR_SOURCE.PAGE_ADAPTER,
        message: "ignored",
      },
    }),
    "The map bridge failed temporarily. Try the action again.",
  );
});

test("presentation centralizes panel action feedback copy", () => {
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.PASTE_CANCELLED),
    "Paste cancelled.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLEAR_IMAGE),
    "Cleared the current screenshot.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE),
    "Clipboard does not contain an image.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_UNREADABLE),
    "Clipboard image could not be read.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE_WITH_PROMPT),
    `Clipboard does not contain an image. ${MANUAL_PASTE_PROMPT}`,
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_LOADED, {
      src: "data:image/png;base64,abc",
      width: 640,
      height: 320,
      original: {
        width: 640,
        height: 320,
      },
      working: {
        src: "data:image/png;base64,abc",
        width: 640,
        height: 320,
        scaleFromOriginal: 1,
      },
    }),
    "Loaded screenshot 640×320.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_LOADED, {
      src: "data:image/png;base64,resized",
      width: 2048,
      height: 1024,
      original: {
        width: 5000,
        height: 2500,
      },
      working: {
        src: "data:image/png;base64,resized",
        width: 2048,
        height: 1024,
        scaleFromOriginal: 2048 / 5000,
      },
    }),
    "Loaded screenshot 2048×1024 from 5000×2500.",
  );
});
