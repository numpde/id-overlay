import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_FEEDBACK_ACTION,
  describePanelActionPresentation,
  describeRuntimeErrorPresentation,
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
} from "../../src/core/presentation.js";
import { INTERACTION_EVENT } from "../../src/core/interaction-policy.js";
import { MACHINE_STATUS_MESSAGE } from "../../src/core/machine/index.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";

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
    describeInteractionEventPresentation({ type: INTERACTION_EVENT.PINS_CLEARED }),
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
      type: INTERACTION_EVENT.RUNTIME_ERROR,
      error: {
        source: RUNTIME_ERROR_SOURCE.PAGE_ADAPTER,
        message: "ignored",
      },
    }),
    "The map bridge failed temporarily. Try the action again.",
  );
});

test("presentation centralizes panel-local clipboard feedback copy", () => {
  assert.equal(
    describePanelActionPresentation(PANEL_FEEDBACK_ACTION.PASTE_CANCELLED),
    "Paste cancelled.",
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
    `Clipboard does not contain an image. ${MACHINE_STATUS_MESSAGE.PASTE_ARMED}`,
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
