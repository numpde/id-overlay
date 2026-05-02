import test from "node:test";
import assert from "node:assert/strict";

import { createStatusController } from "../../src/content/status-controller.js";
import { INTERACTION_EVENT } from "../../src/core/interaction-policy.js";
import {
  PANEL_FEEDBACK_ACTION,
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
} from "../../src/core/presentation.js";
import { resolveUiViewModel } from "../../src/core/ui-view-model.js";
import { createStateStore } from "../../src/core/state.js";
import { createValueStore } from "../../src/core/value-store.js";
import { projectLiveUiState } from "../../src/core/ui-live-state.js";
import { createInitialPanelActionState } from "../../src/core/panel-state.js";
import { UI_PANEL_INTENT_KIND } from "../../src/core/ui-state-model.js";
import { resolveUiStatusBaseline } from "../../src/core/ui-status-model.js";

test("resolveUiStatusBaseline explains the current registration workflow", () => {
  assert.equal(
    resolveUiStatusBaseline({
      uiState: projectLiveUiState({
        state: { image: null, mode: "trace" },
        runtime: {},
        panelActionState: { kind: UI_PANEL_INTENT_KIND.IDLE },
      }),
    }),
    "Paste a screenshot to begin.",
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: projectLiveUiState({
        state: {
          image: { src: "x", width: 1, height: 1 },
          mode: "trace",
          registration: { solvedTransform: null, dirty: false },
        },
        runtime: {},
        panelActionState: { kind: UI_PANEL_INTENT_KIND.IDLE },
      }),
    }),
    "Trace mode: the overlay follows the map using the current manual placement.",
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: projectLiveUiState({
        state: {
          image: { src: "x", width: 1, height: 1 },
          mode: "align",
          registration: {
            solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
            dirty: false,
          },
        },
        runtime: {},
        panelActionState: { kind: UI_PANEL_INTENT_KIND.IDLE },
      }),
    }),
    "Align mode: solved transform preview active. Switch to Trace to verify map-following, or adjust placement to refine and recompute.",
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: projectLiveUiState({
        state: {
          image: { src: "x", width: 1, height: 1 },
          mode: "trace",
          registration: {
            solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
            dirty: false,
          },
        },
        runtime: {},
        panelActionState: { kind: UI_PANEL_INTENT_KIND.IDLE },
      }),
    }),
    "Trace mode: the overlay follows the map using the solved transform.",
  );
});

test("resolveUiStatusBaseline prioritizes live interaction state over static render copy", () => {
  const solvedState = {
    image: { src: "x", width: 1, height: 1 },
    mode: "align",
    registration: {
      solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
      dirty: false,
    },
  };

  assert.equal(
    resolveUiStatusBaseline({
      uiState: projectLiveUiState({
        state: solvedState,
        runtime: { isPassThroughActive: true, isDragging: false, dragMode: null },
        panelActionState: { kind: UI_PANEL_INTENT_KIND.IDLE },
      }),
    }),
    "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.",
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: projectLiveUiState({
        state: solvedState,
        runtime: { isPassThroughActive: false, isDragging: true, dragMode: "map-pan" },
        panelActionState: { kind: UI_PANEL_INTENT_KIND.IDLE },
      }),
    }),
    "Panning the map while the overlay follows.",
  );
});

test("resolveUiViewModel describes the current mode state for the panel switch", () => {
  const traceViewModel = resolveUiViewModel({
    uiState: projectLiveUiState({
      state: { image: null, mode: "trace", opacity: 0.6, registration: { pins: [], solvedTransform: null, dirty: false } },
      panelActionState: createInitialPanelActionState(),
    }),
  });
  assert.deepEqual(traceViewModel.modeSwitch, {
    checked: false,
    disabled: true,
    accessibleLabel: "Mode: Trace",
    mode: "trace",
  });

  const alignViewModel = resolveUiViewModel({
    uiState: projectLiveUiState({
      state: { image: { src: "x", width: 1, height: 1 }, mode: "align", opacity: 0.6, registration: { pins: [], solvedTransform: null, dirty: false } },
      panelActionState: createInitialPanelActionState(),
    }),
  });
  assert.deepEqual(alignViewModel.modeSwitch, {
    checked: true,
    disabled: false,
    accessibleLabel: "Mode: Align",
    mode: "align",
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

test("status controller renders semantic panel feedback through presentation", () => {
  const store = createStateStore();
  const runtime = createValueStore({
    isDragging: false,
    isPassThroughActive: false,
    dragMode: null,
  });
  const interactions = {
    getRuntimeState() {
      return runtime.get();
    },
    subscribe(listener, options) {
      return runtime.subscribe(listener, options);
    },
  };

  const controller = createStatusController({ store, interactions });
  const messages = [];
  const unsubscribe = controller.subscribe((message) => {
    messages.push(message);
  });

  controller.showPanelFeedback(PANEL_FEEDBACK_ACTION.UNDO, {
    historyDescriptor: { kind: "move-overlay", label: "Moved overlay" },
  }, { durationMs: 0 });

  assert.equal(messages.at(-1), "Undid: Moved overlay.");

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

test("status controller uses canonical ui-state source for baseline panel prompts", () => {
  const store = createStateStore();
  const runtime = createValueStore({
    isDragging: false,
    isPassThroughActive: false,
    dragMode: null,
  });
  const interactions = {
    getRuntimeState() {
      return runtime.get();
    },
    subscribe(listener, options) {
      return runtime.subscribe(listener, options);
    },
  };

  const controller = createStatusController({ store, interactions });
  controller.setPanelActionStateSource(() => ({
    kind: UI_PANEL_INTENT_KIND.PASTE_ARMED,
  }));

  assert.equal(
    controller.getMessage(),
    "Press Ctrl/Cmd+V to paste an image from your clipboard.",
  );

  controller.destroy();
});
