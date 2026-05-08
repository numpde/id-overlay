import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import {
  MACHINE_RUNTIME_FACT_KIND,
} from "../../src/core/machine/runtime-facts.js";
import { createInteractionRuntimeFactPort } from "../../src/content/interactions/runtime-fact-port.js";

test("interaction runtime fact port reports typed runtime facts through the action port", () => {
  const facts = [];
  const runtimeFacts = createInteractionRuntimeFactPort({
    machineActions: {
      observeRuntimeFact(fact) {
        facts.push(fact);
      },
    },
    getPointerScreenPx: () => ({ x: 7, y: 8 }),
  });

  runtimeFacts.observePointer({ x: 1, y: 2 });
  runtimeFacts.clearPointer();
  runtimeFacts.observeGestureStart({ x: 3, y: 4 }, { gestureKind: DRAG_MODE.MAP_PAN });
  runtimeFacts.observeGestureMove({ x: 5, y: 6 }, { gestureKind: DRAG_MODE.MAP_PAN });
  runtimeFacts.observeGestureFinish({ x: 7, y: 8 });
  runtimeFacts.observeInputInterrupted();
  runtimeFacts.observePassThroughPress();
  runtimeFacts.observePassThroughRelease();

  assert.deepEqual(facts, [
    {
      kind: MACHINE_RUNTIME_FACT_KIND.POINTER_OBSERVED,
      screenPx: { x: 1, y: 2 },
    },
    {
      kind: MACHINE_RUNTIME_FACT_KIND.POINTER_CLEARED,
      screenPx: null,
    },
    {
      kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_BEGAN,
      screenPx: { x: 3, y: 4 },
      gestureKind: DRAG_MODE.MAP_PAN,
    },
    {
      kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_MOVED,
      screenPx: { x: 5, y: 6 },
      gestureKind: DRAG_MODE.MAP_PAN,
    },
    {
      kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_ENDED,
      screenPx: { x: 7, y: 8 },
    },
    {
      kind: MACHINE_RUNTIME_FACT_KIND.INPUT_INTERRUPTED,
      screenPx: { x: 7, y: 8 },
    },
    {
      kind: MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_PRESSED,
    },
    {
      kind: MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_RELEASED,
    },
  ]);
});

test("interaction runtime fact port accepts explicit interruption pointer override", () => {
  const facts = [];
  const runtimeFacts = createInteractionRuntimeFactPort({
    machineActions: {
      observeRuntimeFact(fact) {
        facts.push(fact);
      },
    },
    getPointerScreenPx: () => ({ x: 7, y: 8 }),
  });

  runtimeFacts.observeInputInterrupted({ pointerScreenPx: null });

  assert.deepEqual(facts, [
    {
      kind: MACHINE_RUNTIME_FACT_KIND.INPUT_INTERRUPTED,
      screenPx: null,
    },
  ]);
});
