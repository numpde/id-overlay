import test from "node:test";
import assert from "node:assert/strict";

import {
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
  resolveDefaultStatusMessage,
  resolvePanelPresentation,
  resolveOverlaySessionPresentation,
} from "../../src/core/presentation.js";

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
  assert.equal(empty.pinCountLabel, "0");
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
  assert.equal(solved.pinCountLabel, "2");
  assert.equal(solved.canComputeTransform, true);
  assert.equal(solved.canClearPins, true);
  assert.equal(solved.solve.summaryLabel, "Solved from 2 pin(s)");
  assert.equal(solved.render.label, "Solved transform active");
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
      runtime: { isPassThroughActive: false, isDragging: true, dragMode: "shared-pan" },
    }),
    "Shared drag: moving the map and overlay together.",
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
    isPasteArmed: true,
    manualPastePrompt: "Paste now.",
  });

  assert.deepEqual(presentation, {
    pasteLabel: "Paste…",
    opacityValue: "0.75",
    modeButtonLabel: "Trace",
    hasImage: true,
    canComputeTransform: true,
    canClearPins: true,
    pinCountLabel: "2",
    solveLabel: "Ready to compute",
    renderLabel: "Manual placement active",
    statusMessage: "Paste now.",
  });
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
