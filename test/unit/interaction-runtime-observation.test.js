import test from "node:test";
import assert from "node:assert/strict";

import { createMachineHost } from "../../src/core/machine/host.js";
import { createPointerObservedFact } from "../../src/core/machine/runtime-facts.js";
import { createInteractionRuntimeObservation } from "../../src/content/interactions/runtime-observation.js";

test("interaction runtime observation exposes read-only runtime state and pointer projection", () => {
  const machineHost = createMachineHost();
  const runtimeObservation = createInteractionRuntimeObservation({ machineHost });

  assert.equal(runtimeObservation.getRuntimeState(), machineHost.getState().runtime);
  assert.equal(runtimeObservation.getPointerScreenPx(), null);

  machineHost.observeRuntimeFact(createPointerObservedFact({ x: 10, y: 20 }));

  assert.equal(runtimeObservation.getRuntimeState(), machineHost.getState().runtime);
  assert.deepEqual(runtimeObservation.getPointerScreenPx(), { x: 10, y: 20 });

  runtimeObservation.destroy();
});

test("interaction runtime observation emits only input-runtime changes", () => {
  const machineHost = createMachineHost();
  const runtimeObservation = createInteractionRuntimeObservation({ machineHost });
  const observedChanges = [];
  const unsubscribe = runtimeObservation.subscribe((runtime, previousRuntime) => {
    observedChanges.push({ runtime, previousRuntime });
  });

  machineHost.reportRuntimeError({ message: "ignored for runtime projection" });
  machineHost.observeRuntimeFact(createPointerObservedFact({ x: 1, y: 2 }));

  assert.equal(observedChanges.length, 2);
  assert.equal(observedChanges[0].runtime.pointer.screenPx, null);
  assert.equal(observedChanges[0].previousRuntime, undefined);
  assert.deepEqual(observedChanges[1].runtime.pointer.screenPx, { x: 1, y: 2 });
  assert.equal(observedChanges[1].previousRuntime.pointer.screenPx, null);

  unsubscribe();
  machineHost.observeRuntimeFact(createPointerObservedFact({ x: 3, y: 4 }));
  assert.equal(observedChanges.length, 2);

  runtimeObservation.destroy();
});

test("interaction runtime observation destroy removes subscriptions and makes later subscriptions inert", () => {
  const machineHost = createMachineHost();
  const runtimeObservation = createInteractionRuntimeObservation({ machineHost });
  const observedRuntime = [];

  runtimeObservation.subscribe((runtime) => {
    observedRuntime.push(runtime);
  }, { emitCurrent: false });
  runtimeObservation.destroy();
  machineHost.observeRuntimeFact(createPointerObservedFact({ x: 10, y: 20 }));

  const unsubscribe = runtimeObservation.subscribe((runtime) => {
    observedRuntime.push(runtime);
  });
  unsubscribe();

  assert.deepEqual(observedRuntime, []);
});
