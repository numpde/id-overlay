import test from "node:test";
import assert from "node:assert/strict";

import { createStatusController } from "../../src/content/status-controller.js";
import { INTERACTION_EVENT } from "../../src/core/interactions.js";
import {
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
  resolveDefaultStatusMessage,
  resolveModeSwitchPresentation,
} from "../../src/core/presentation.js";
import { createStateStore } from "../../src/core/state.js";
import { createValueStore } from "../../src/core/value-store.js";

test("resolveDefaultStatusMessage explains the current registration workflow", () => {
  assert.equal(
    resolveDefaultStatusMessage({
      state: { image: null, mode: "trace" },
      runtime: {},
    }),
    "Paste a screenshot to begin.",
  );

  assert.equal(
    resolveDefaultStatusMessage({
      state: {
        image: { src: "x", width: 1, height: 1 },
        mode: "trace",
        registration: { solvedTransform: null, dirty: false },
      },
      runtime: {},
    }),
    "Trace mode: the overlay follows the map using the current manual placement.",
  );

  assert.equal(
    resolveDefaultStatusMessage({
      state: {
        image: { src: "x", width: 1, height: 1 },
        mode: "align",
        registration: {
          solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
          dirty: false,
        },
      },
      runtime: {},
    }),
    "Align mode: solved transform preview active. Switch to Trace to verify map-following, or adjust placement to refine and recompute.",
  );

  assert.equal(
    resolveDefaultStatusMessage({
      state: {
        image: { src: "x", width: 1, height: 1 },
        mode: "trace",
        registration: {
          solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
          dirty: false,
        },
      },
      runtime: {},
    }),
    "Trace mode: the overlay follows the map using the solved transform.",
  );
});

test("resolveDefaultStatusMessage prioritizes live interaction state over static render copy", () => {
  const solvedState = {
    image: { src: "x", width: 1, height: 1 },
    mode: "align",
    registration: {
      solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
      dirty: false,
    },
  };

  assert.equal(
    resolveDefaultStatusMessage({
      state: solvedState,
      runtime: { isPassThroughActive: true, isDragging: false, dragMode: null },
    }),
    "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.",
  );

  assert.equal(
    resolveDefaultStatusMessage({
      state: solvedState,
      runtime: { isPassThroughActive: false, isDragging: true, dragMode: "shared-pan" },
    }),
    "Shared drag: moving the map and overlay together.",
  );
});

test("resolveModeSwitchPresentation describes the current mode state", () => {
  assert.deepEqual(resolveModeSwitchPresentation("trace"), {
    checked: false,
    label: "Trace",
    ariaLabel: "Mode: Trace",
  });
  assert.deepEqual(resolveModeSwitchPresentation("align"), {
    checked: true,
    label: "Align",
    ariaLabel: "Mode: Align",
  });
});

test("describePinResultPresentation is the single source of truth for pin feedback", () => {
  assert.equal(
    describePinResultPresentation({ ok: true, action: "added", pin: { id: 3 } }),
    "Added pin 3.",
  );
  assert.equal(
    describePinResultPresentation({ ok: true, action: "removed", pin: { id: 3 } }),
    "Removed pin 3.",
  );
  assert.equal(
    describePinResultPresentation({ ok: false, reason: "pointer-outside-image" }),
    "Move the pointer over the screenshot before adding a pin.",
  );
});

test("describeSolveResultPresentation is the single source of truth for solve feedback", () => {
  assert.equal(
    describeSolveResultPresentation({ ok: true, pinCount: 3 }),
    "Computed transform from 3 pin(s).",
  );
  assert.equal(
    describeSolveResultPresentation({ ok: false, reason: "insufficient-pins", pinCount: 1 }),
    "Need at least 2 pins to compute a transform. Current pins: 1.",
  );
});

test("describeInteractionEventPresentation centralizes interaction event feedback", () => {
  assert.equal(
    describeInteractionEventPresentation({
      type: INTERACTION_EVENT.PIN_RESULT,
      result: { ok: true, action: "added", pin: { id: 3 } },
    }),
    "Added pin 3.",
  );
  assert.equal(
    describeInteractionEventPresentation({
      type: INTERACTION_EVENT.SOLVE_RESULT,
      result: { ok: false, reason: "insufficient-pins", pinCount: 1 },
    }),
    "Need at least 2 pins to compute a transform. Current pins: 1.",
  );
  assert.equal(
    describeInteractionEventPresentation({ type: INTERACTION_EVENT.PINS_CLEARED }),
    "Cleared all registration pins.",
  );
});

test("status controller falls back to derived status after a transient", async () => {
  const store = createStateStore();
  const runtime = createValueStore({
    isDragging: false,
    isPassThroughActive: false,
    dragMode: null,
  });
  const eventListeners = new Set();
  const interactions = {
    getRuntimeState() {
      return runtime.get();
    },
    subscribe(listener, options) {
      return runtime.subscribe(listener, options);
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };

  const controller = createStatusController({ store, interactions });
  const messages = [];
  const unsubscribe = controller.subscribe((message) => {
    messages.push(message);
  });

  controller.showTransient("Loaded screenshot.", { durationMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(messages.at(-1), "Paste a screenshot to begin.");

  unsubscribe();
  controller.destroy();
});

test("status controller reacts to pin and solve events", () => {
  const store = createStateStore();
  const runtime = createValueStore({
    isDragging: false,
    isPassThroughActive: false,
    dragMode: null,
  });
  const eventListeners = new Set();
  const interactions = {
    getRuntimeState() {
      return runtime.get();
    },
    subscribe(listener, options) {
      return runtime.subscribe(listener, options);
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };

  const controller = createStatusController({ store, interactions });
  for (const listener of eventListeners) {
    listener({
      type: INTERACTION_EVENT.PIN_RESULT,
      result: { ok: true, action: "added", pin: { id: 1 } },
    });
  }
  assert.equal(controller.getMessage(), "Added pin 1.");

  for (const listener of eventListeners) {
    listener({
      type: INTERACTION_EVENT.SOLVE_RESULT,
      result: { ok: false, reason: "insufficient-pins", pinCount: 1 },
    });
  }
  assert.equal(
    controller.getMessage(),
    "Need at least 2 pins to compute a transform. Current pins: 1.",
  );

  for (const listener of eventListeners) {
    listener({ type: INTERACTION_EVENT.PINS_CLEARED });
  }
  assert.equal(controller.getMessage(), "Cleared all registration pins.");

  controller.destroy();
});
