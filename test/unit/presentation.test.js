import test from "node:test";
import assert from "node:assert/strict";

import {
  CLEAR_IMAGE_CONFIRMATION_MESSAGE,
  PANEL_FEEDBACK_ACTION,
  describePanelActionPresentation,
  describeRuntimeErrorPresentation,
  MANUAL_PASTE_PROMPT,
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
  resolveClearPinsLabel,
  resolvePanelActionPresentation,
  resolveClearImagePresentation,
  resolveDefaultStatusMessage,
  resolveOverlayRenderPresentation,
  resolvePanelPresentation,
  resolveRegistrationSolvePresentation,
  resolveOverlaySessionPresentation,
} from "../../src/core/presentation.js";
import { PANEL_ACTION_KIND } from "../../src/core/panel-state.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";

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
  assert.equal(empty.pinCount, 0);
  assert.equal(empty.canComputeTransform, false);
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
  assert.equal(solved.pinCount, 2);
  assert.equal(solved.canComputeTransform, true);
  assert.equal(solved.canClearPins, true);
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
    canClearPins: false,
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
    canClearPins: true,
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
    canClearPins: true,
    summaryLabel: "Pins changed; recompute needed",
    statusMessage: "Align mode: pins changed. Compute the transform or switch to Trace to auto-apply it.",
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
    canClearPins: true,
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

test("resolveDefaultStatusMessage centralizes runtime-aware status copy", () => {
  assert.equal(
    resolveDefaultStatusMessage({
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
    resolveDefaultStatusMessage({
      state: solvedAlignState,
      runtime: { isPassThroughActive: true, isDragging: false, dragMode: null },
    }),
    "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.",
  );

  assert.equal(
    resolveDefaultStatusMessage({
      state: solvedAlignState,
      runtime: { isPassThroughActive: false, isDragging: true, dragMode: "map-pan" },
    }),
    "Panning the map while the overlay follows.",
  );
});

test("resolvePanelPresentation centralizes panel labels and enablement", () => {
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
    statusMessage: "Ready.",
    panelActionState: {
      kind: PANEL_ACTION_KIND.PASTE_ARMED,
      sessionId: 1,
    },
  });

  assert.deepEqual(presentation, {
    pasteLabel: "Paste…",
    opacityValue: "0.75",
    modeSwitch: {
      checked: true,
      label: "Align",
      ariaLabel: "Mode: Align",
    },
    hasImage: true,
    canComputeTransform: true,
    canClearPins: true,
    clearPinsLabel: "Clear 2 pins",
    clearButtonLabel: "Clear",
    clearButtonVariant: "neutral",
    clearButtonDisabled: false,
    statusMessage: MANUAL_PASTE_PROMPT,
  });
});

test("resolveClearPinsLabel centralizes the pin-count button copy", () => {
  assert.equal(resolveClearPinsLabel(0), "Clear pins");
  assert.equal(resolveClearPinsLabel(1), "Clear 1 pin");
  assert.equal(resolveClearPinsLabel(3), "Clear 3 pins");
});

test("resolvePanelPresentation gives clear-confirmation copy priority over steady status", () => {
  const presentation = resolvePanelPresentation({
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
    statusMessage: "Ready.",
    panelActionState: {
      kind: PANEL_ACTION_KIND.CLEAR_CONFIRM,
      sessionId: 0,
    },
  });

  assert.equal(presentation.clearButtonLabel, "Clear?");
  assert.equal(presentation.clearButtonVariant, "confirm");
  assert.equal(presentation.statusMessage, CLEAR_IMAGE_CONFIRMATION_MESSAGE);
});

test("resolvePanelActionPresentation centralizes panel-local action state", () => {
  assert.deepEqual(
    resolvePanelActionPresentation({
      actionState: {
        kind: PANEL_ACTION_KIND.IDLE,
        sessionId: 0,
      },
      hasImage: true,
    }),
    {
      pasteLabel: "Paste",
      clearButtonLabel: "Clear",
      clearButtonVariant: "neutral",
      clearButtonDisabled: false,
      statusMessage: null,
    },
  );

  assert.deepEqual(
    resolvePanelActionPresentation({
      actionState: {
        kind: PANEL_ACTION_KIND.PASTE_ARMED,
        sessionId: 1,
      },
      hasImage: true,
    }),
    {
      pasteLabel: "Paste…",
      clearButtonLabel: "Clear",
      clearButtonVariant: "neutral",
      clearButtonDisabled: false,
      statusMessage: MANUAL_PASTE_PROMPT,
    },
  );

  assert.deepEqual(
    resolvePanelActionPresentation({
      actionState: {
        kind: PANEL_ACTION_KIND.CLEAR_CONFIRM,
        sessionId: 0,
      },
      hasImage: true,
    }),
    {
      pasteLabel: "Paste",
      clearButtonLabel: "Clear?",
      clearButtonVariant: "confirm",
      clearButtonDisabled: false,
      statusMessage: CLEAR_IMAGE_CONFIRMATION_MESSAGE,
    },
  );
});

test("resolveClearImagePresentation centralizes destructive-clear confirmation state", () => {
  assert.deepEqual(
    resolveClearImagePresentation({
      hasImage: false,
      isConfirming: false,
    }),
    {
      label: "Clear",
      variant: "neutral",
      disabled: true,
      statusMessage: null,
    },
  );

  assert.deepEqual(
    resolveClearImagePresentation({
      hasImage: true,
      isConfirming: true,
    }),
    {
      label: "Clear?",
      variant: "confirm",
      disabled: false,
      statusMessage: CLEAR_IMAGE_CONFIRMATION_MESSAGE,
    },
  );
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
