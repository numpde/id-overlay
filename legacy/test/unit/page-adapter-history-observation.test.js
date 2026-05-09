import test from "node:test";
import assert from "node:assert/strict";

import {
  observeHistoryMutations,
} from "../../src/content/page-adapter/history-observation.js";

test("history observation reports replaceState and pushState after the original method runs", () => {
  const calls = [];
  const mutations = [];
  const history = {
    replaceState(...args) {
      calls.push(["replaceState", args]);
      return "replace-result";
    },
    pushState(...args) {
      calls.push(["pushState", args]);
      return "push-result";
    },
  };

  const restore = observeHistoryMutations({
    hashTarget: { history },
    onHistoryMutation() {
      mutations.push(calls.at(-1)[0]);
    },
  });

  assert.equal(history.replaceState({ id: 1 }, "", "#map=1/2/3"), "replace-result");
  assert.equal(history.pushState({ id: 2 }, "", "#map=4/5/6"), "push-result");
  assert.deepEqual(calls, [
    ["replaceState", [{ id: 1 }, "", "#map=1/2/3"]],
    ["pushState", [{ id: 2 }, "", "#map=4/5/6"]],
  ]);
  assert.deepEqual(mutations, ["replaceState", "pushState"]);

  restore();
});

test("history observation restore reinstates the original methods", () => {
  let mutationCount = 0;
  const history = {
    replaceState() {
      return "replace-result";
    },
    pushState() {
      return "push-result";
    },
  };
  const originalReplaceState = history.replaceState;
  const originalPushState = history.pushState;

  const restore = observeHistoryMutations({
    hashTarget: { history },
    onHistoryMutation() {
      mutationCount += 1;
    },
  });

  assert.notEqual(history.replaceState, originalReplaceState);
  assert.notEqual(history.pushState, originalPushState);

  restore();

  assert.equal(history.replaceState, originalReplaceState);
  assert.equal(history.pushState, originalPushState);
  assert.equal(history.replaceState(), "replace-result");
  assert.equal(history.pushState(), "push-result");
  assert.equal(mutationCount, 0);
});

test("history observation is inert when there are no observable history methods", () => {
  assert.equal(
    observeHistoryMutations({
      hashTarget: { history: {} },
      onHistoryMutation() {},
    }),
    null,
  );
  assert.equal(
    observeHistoryMutations({
      hashTarget: {},
      onHistoryMutation() {},
    }),
    null,
  );
});
