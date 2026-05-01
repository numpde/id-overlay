import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_FEEDBACK_ACTION,
  describePendingHistoryControl,
  describeOverlayRenderLabel,
  describeOverlayRenderMessage,
  describePanelActionPresentation,
  describeRegistrationSolveSummary,
  describeRuntimeErrorPresentation,
  resolveHistoryControlPresentation,
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
} from "../../src/core/presentation.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";
import { resolveRegistrationSolveState } from "../../src/core/state.js";
import { resolveOverlayRenderState } from "../../src/core/transform.js";
import { projectLiveUiState } from "../../src/core/ui-live-state.js";
import {
  CLEAR_PINS_CONFIRMATION_MESSAGE,
  CLEAR_IMAGE_CONFIRMATION_MESSAGE,
  DIRTY_PINS_STATUS_MESSAGE,
  MANUAL_PASTE_PROMPT,
  resolveUiStatusBaseline,
} from "../../src/core/ui-status-model.js";
import { resolveUiViewModel } from "../../src/core/ui-view-model.js";
import { UI_PANEL_INTENT_KIND } from "../../src/core/ui-state-model.js";

function resolveStatusBaseline({ state, runtime, panelActionState = { kind: UI_PANEL_INTENT_KIND.IDLE } }) {
  return resolveUiStatusBaseline({
    uiState: projectLiveUiState({
      state,
      runtime,
      panelActionState,
    }),
  });
}

test("presentation centralizes solve and render copy from semantic state", () => {
  assert.deepEqual(resolveRegistrationSolveState({
    pins: [],
    solvedTransform: null,
    dirty: false,
  }), {
    kind: "empty",
    pinCount: 0,
    solvedPinCount: 0,
    canCompute: false,
  });
  assert.equal(
    describeRegistrationSolveSummary(resolveRegistrationSolveState({
      pins: [],
      solvedTransform: null,
      dirty: false,
    })),
    "No pins yet",
  );

  assert.deepEqual(resolveRegistrationSolveState({
    pins: [{ id: 1 }],
    solvedTransform: null,
    dirty: true,
  }), {
    kind: "insufficient-pins",
    pinCount: 1,
    solvedPinCount: 1,
    canCompute: false,
  });
  assert.equal(
    describeRegistrationSolveSummary(resolveRegistrationSolveState({
      pins: [{ id: 1 }],
      solvedTransform: null,
      dirty: true,
    })),
    "Collect at least 2 pins",
  );

  assert.deepEqual(resolveRegistrationSolveState({
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: null,
    dirty: true,
  }), {
    kind: "dirty",
    pinCount: 2,
    solvedPinCount: 2,
    canCompute: true,
  });
  assert.equal(
    describeRegistrationSolveSummary(resolveRegistrationSolveState({
      pins: [{ id: 1 }, { id: 2 }],
      solvedTransform: null,
      dirty: true,
    })),
    "Pins changed; fit pending",
  );
  assert.equal(DIRTY_PINS_STATUS_MESSAGE, "Align mode: pins changed. Switch to Trace to fit the overlay from the current pins.");

  assert.deepEqual(resolveRegistrationSolveState({
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0, pinCount: 3 },
    dirty: false,
  }), {
    kind: "solved",
    pinCount: 2,
    solvedPinCount: 3,
    canCompute: true,
  });
  assert.equal(
    describeRegistrationSolveSummary(resolveRegistrationSolveState({
      pins: [{ id: 1 }, { id: 2 }],
      solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0, pinCount: 3 },
      dirty: false,
    })),
    "Solved from 3 pin(s)",
  );

  const emptyRenderState = resolveOverlayRenderState({
    image: null,
    mode: "trace",
    registration: { solvedTransform: null, dirty: false },
  });
  assert.deepEqual(emptyRenderState, {
    source: "none",
    similarityTransform: null,
  });
  assert.equal(
    describeOverlayRenderLabel({ renderState: emptyRenderState, mode: "trace" }),
    "No image",
  );
  assert.equal(
    describeOverlayRenderMessage({ renderState: emptyRenderState, mode: "trace" }),
    "Paste a screenshot to begin.",
  );

  const solvedRenderState = resolveOverlayRenderState({
    image: { width: 1, height: 1 },
    mode: "trace",
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: false },
  });
  assert.equal(solvedRenderState.source, "solved");
  assert.equal(
    describeOverlayRenderLabel({ renderState: solvedRenderState, mode: "trace" }),
    "Solved transform active",
  );
  assert.equal(
    describeOverlayRenderMessage({ renderState: solvedRenderState, mode: "trace" }),
    "Trace mode: the overlay follows the map using the solved transform.",
  );
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
  const presentation = resolveUiViewModel({
    uiState: projectLiveUiState({
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
    }),
  });

  assert.deepEqual(presentation, {
    opacityControl: {
      value: "0.75",
      disabled: false,
    },
    modeSwitch: {
      checked: true,
      disabled: false,
      accessibleLabel: "Mode: Align",
      mode: "align",
    },
    historyControls: {
      undo: {
        disabled: true,
        title: "",
        accessibleLabel: "Undo",
      },
      redo: {
        disabled: true,
        title: "",
        accessibleLabel: "Redo",
      },
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
  const viewModel = resolveUiViewModel({
    uiState: projectLiveUiState({
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
    }),
  });
  assert.equal(viewModel.mainAction.target, "clear-image");
  assert.equal(viewModel.mainAction.label, "Clear image");
  assert.equal(viewModel.mainAction.disabled, false);
  assert.equal(viewModel.modeSwitch.disabled, false);
});

test("resolvePanelViewModel keeps panel semantics on the main-action image source", () => {
  const viewModel = resolveUiViewModel({
    uiState: projectLiveUiState({
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
    }),
  });

  assert.equal(viewModel.mainAction.hasImage, false);
  assert.equal(viewModel.mainAction.disabled, false);
  assert.equal(viewModel.mainAction.label, "Paste");
  assert.equal(viewModel.mainAction.shouldReset, true);
  assert.equal(viewModel.modeSwitch.disabled, true);
});

test("resolvePanelPresentation keeps confirmation labels aligned with canonical status prompts", () => {
  const pinsPresentation = resolveUiViewModel({
    uiState: projectLiveUiState({
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
    }),
  });

  assert.equal(pinsPresentation.mainAction.label, "Clear pins?");
  assert.equal(pinsPresentation.mainAction.presentationKind, "confirm");

  const imagePresentation = resolveUiViewModel({
    uiState: projectLiveUiState({
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
    }),
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
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.UNDO),
    "Undid change.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.UNDO, {
      historyLabel: "Rotated overlay",
    }),
    "Undid: Rotated overlay.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.REDO),
    "Redid change.",
  );
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.REDO, {
      historyLabel: "Rotated overlay",
    }),
    "Redid: Rotated overlay.",
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

test("presentation describes pending history controls by their result", () => {
  assert.equal(
    describePendingHistoryControl({
      direction: "undo",
      descriptor: { kind: "clear-image", label: "Cleared image" },
    }),
    "Reload image",
  );
  assert.equal(
    describePendingHistoryControl({
      direction: "redo",
      descriptor: { kind: "clear-image", label: "Cleared image" },
    }),
    "Clear image",
  );
  assert.equal(
    describePendingHistoryControl({
      direction: "undo",
      descriptor: { kind: "load-image", label: "Loaded screenshot" },
    }),
    "Remove image",
  );
  assert.equal(
    describePendingHistoryControl({
      direction: "redo",
      descriptor: { kind: "load-image", label: "Loaded screenshot" },
    }),
    "Reload image",
  );
  assert.equal(
    describePendingHistoryControl({
      direction: "undo",
      descriptor: { kind: "rotate-overlay", label: "Rotated overlay" },
    }),
    "Restore rotation",
  );
  assert.equal(
    describePendingHistoryControl({
      direction: "later",
      descriptor: { kind: "rotate-overlay", label: "Rotated overlay" },
    }),
    "",
  );
  assert.equal(describePendingHistoryControl({ direction: "undo", descriptor: null }), "");
});

test("presentation resolves complete history control DOM copy", () => {
  assert.deepEqual(
    resolveHistoryControlPresentation({
      direction: "undo",
      descriptor: null,
    }),
    {
      title: "",
      accessibleLabel: "Undo",
    },
  );
  assert.deepEqual(
    resolveHistoryControlPresentation({
      direction: "redo",
      descriptor: { kind: "load-image", label: "Loaded screenshot" },
    }),
    {
      title: "Reload image",
      accessibleLabel: "Reload image",
    },
  );
});
