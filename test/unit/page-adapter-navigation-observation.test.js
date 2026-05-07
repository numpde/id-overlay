import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageNavigationObservation,
} from "../../src/content/page-adapter/navigation-observation.js";

test("page navigation observation attaches canonical map-window navigation listeners", () => {
  const mapWindow = createEventTargetHarness();
  const historyCalls = [];
  const onNavigation = () => {};
  const observation = createPageNavigationObservation({
    onNavigation,
    observeHistory: (args) => {
      historyCalls.push(args);
      return () => {};
    },
  });

  observation.observeWindow(mapWindow);

  assert.deepEqual(mapWindow.added, [
    ["hashchange", onNavigation],
    ["popstate", onNavigation],
  ]);
  assert.deepEqual(historyCalls, [{
    hashTarget: mapWindow,
    onHistoryMutation: onNavigation,
  }]);
});

test("page navigation observation retargets only when the map window changes", () => {
  const firstWindow = createEventTargetHarness();
  const secondWindow = createEventTargetHarness();
  const restoredTargets = [];
  const onNavigation = () => {};
  const observation = createPageNavigationObservation({
    onNavigation,
    observeHistory: ({ hashTarget }) => () => restoredTargets.push(hashTarget),
  });

  observation.observeWindow(firstWindow);
  observation.observeWindow(firstWindow);
  observation.observeWindow(secondWindow);

  assert.deepEqual(firstWindow.added, [
    ["hashchange", onNavigation],
    ["popstate", onNavigation],
  ]);
  assert.deepEqual(firstWindow.removed, [
    ["hashchange", onNavigation],
    ["popstate", onNavigation],
  ]);
  assert.deepEqual(secondWindow.added, [
    ["hashchange", onNavigation],
    ["popstate", onNavigation],
  ]);
  assert.deepEqual(restoredTargets, [firstWindow]);
});

test("page navigation observation detaches listeners and history patches on destroy", () => {
  const mapWindow = createEventTargetHarness();
  let restoreCount = 0;
  const onNavigation = () => {};
  const observation = createPageNavigationObservation({
    onNavigation,
    observeHistory: () => () => {
      restoreCount += 1;
    },
  });

  observation.observeWindow(mapWindow);
  observation.destroy();

  assert.equal(restoreCount, 1);
  assert.deepEqual(mapWindow.removed, [
    ["hashchange", onNavigation],
    ["popstate", onNavigation],
  ]);
});

test("page navigation observation can detach to a null map window", () => {
  const mapWindow = createEventTargetHarness();
  let restoreCount = 0;
  const onNavigation = () => {};
  const observation = createPageNavigationObservation({
    onNavigation,
    observeHistory: () => () => {
      restoreCount += 1;
    },
  });

  observation.observeWindow(mapWindow);
  observation.observeWindow(null);
  observation.observeWindow(null);

  assert.equal(restoreCount, 1);
  assert.deepEqual(mapWindow.removed, [
    ["hashchange", onNavigation],
    ["popstate", onNavigation],
  ]);
});

function createEventTargetHarness() {
  return {
    added: [],
    removed: [],
    addEventListener(type, listener) {
      this.added.push([type, listener]);
    },
    removeEventListener(type, listener) {
      this.removed.push([type, listener]);
    },
  };
}
