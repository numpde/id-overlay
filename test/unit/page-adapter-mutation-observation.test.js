import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageMutationObservation,
} from "../../src/content/page-adapter/mutation-observation.js";

test("page mutation observation owns the canonical observer options", () => {
  const { MutationObserverCtor, instances } = createMutationObserverHarness();
  const root = {};
  const observedRoots = [];
  const observation = createPageMutationObservation({
    MutationObserverCtor,
    onMutation: () => {},
    onObservedRootChanged: (observedRoot) => observedRoots.push(observedRoot),
  });

  observation.start();
  observation.observeRoot(root);

  assert.equal(instances.length, 1);
  assert.deepEqual(instances[0].observations, [{
    root,
    options: {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "src"],
    },
  }]);
  assert.deepEqual(observedRoots, [root]);
});

test("page mutation observation retargets only when the root changes", () => {
  const { MutationObserverCtor, instances } = createMutationObserverHarness();
  const firstRoot = {};
  const secondRoot = {};
  const observedRoots = [];
  const observation = createPageMutationObservation({
    MutationObserverCtor,
    onMutation: () => {},
    onObservedRootChanged: (observedRoot) => observedRoots.push(observedRoot),
  });

  observation.start();
  observation.observeRoot(firstRoot);
  observation.observeRoot(firstRoot);
  observation.observeRoot(secondRoot);

  assert.equal(instances.length, 1);
  assert.equal(instances[0].disconnectCount, 2);
  assert.deepEqual(instances[0].observations.map(({ root }) => root), [
    firstRoot,
    secondRoot,
  ]);
  assert.deepEqual(observedRoots, [firstRoot, secondRoot]);
});

test("page mutation observation forwards mutation records to the supplied callback", () => {
  const { MutationObserverCtor, instances } = createMutationObserverHarness();
  const mutations = [{ type: "attributes" }];
  const receivedMutations = [];
  const observation = createPageMutationObservation({
    MutationObserverCtor,
    onMutation: (records) => receivedMutations.push(records),
  });

  observation.start();
  instances[0].callback(mutations);

  assert.deepEqual(receivedMutations, [mutations]);
});

test("page mutation observation can be destroyed and started fresh", () => {
  const { MutationObserverCtor, instances } = createMutationObserverHarness();
  const root = {};
  const observation = createPageMutationObservation({
    MutationObserverCtor,
    onMutation: () => {},
  });

  observation.start();
  observation.observeRoot(root);
  observation.destroy();
  observation.start();
  observation.observeRoot(root);

  assert.equal(instances.length, 2);
  assert.equal(instances[0].disconnectCount, 2);
  assert.deepEqual(instances[1].observations.map(({ root: observedRoot }) => observedRoot), [root]);
});

function createMutationObserverHarness() {
  const instances = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnectCount = 0;
      this.observations = [];
      instances.push(this);
    }

    disconnect() {
      this.disconnectCount += 1;
    }

    observe(root, options) {
      this.observations.push({ root, options });
    }
  }

  return {
    MutationObserverCtor: FakeMutationObserver,
    instances,
  };
}
