import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageObservationGraph,
} from "../../src/content/page-adapter/observation-graph.js";
import {
  PAGE_CONTEXT_EVENT,
} from "../../src/content/page-adapter/page-context.js";

test("page observation graph routes page context events to snapshot and viewport owners", () => {
  const calls = [];
  const harness = createObservationGraphHarness(calls);

  harness.emit({ type: PAGE_CONTEXT_EVENT.CHANGE });
  harness.emit({ type: PAGE_CONTEXT_EVENT.STRUCTURE_MUTATION });
  harness.emit({ type: PAGE_CONTEXT_EVENT.CONTEXT_RETARGET });

  assert.deepEqual(calls, [
    "sync-page-context",
    "notify-if-changed",
    "sync-page-context",
    "handle-structure-mutation",
    "notify-if-changed",
    "clear-viewport-element",
  ]);
});

test("page observation graph owns snapshot watcher and context lifecycle", () => {
  const calls = [];
  const harness = createObservationGraphHarness(calls);

  const unsubscribe = harness.graph.snapshotSource.subscribe(() => {});
  harness.watcher.emitObservation();
  unsubscribe();

  assert.deepEqual(calls, [
    "start-page-context",
    "sync-page-context",
    "start-watcher",
    "notify-subscriber",
    "sync-page-context",
    "notify-if-changed",
    "stop-watcher",
    "destroy-page-context",
    "reset-map-view",
  ]);
});

test("page observation graph owns context subscription teardown before snapshot destroy", () => {
  const calls = [];
  const harness = createObservationGraphHarness(calls);

  harness.graph.destroy();
  harness.emit({ type: PAGE_CONTEXT_EVENT.CHANGE });

  assert.deepEqual(calls, [
    "unsubscribe-page-context",
    "destroy-snapshot-source",
    "destroy-viewport-geometry",
  ]);
});

test("page observation graph stops active observation before destroying source", () => {
  const calls = [];
  const harness = createObservationGraphHarness(calls);

  harness.graph.snapshotSource.subscribe(() => {});
  calls.length = 0;
  harness.graph.destroy();

  assert.deepEqual(calls, [
    "unsubscribe-page-context",
    "stop-watcher",
    "destroy-page-context",
    "reset-map-view",
    "destroy-snapshot-source",
    "destroy-viewport-geometry",
  ]);
});

function createObservationGraphHarness(calls) {
  let pageContextListener = null;
  let watcherListener = null;
  const graph = createPageObservationGraph({
    hashTarget: {},
    viewportDocument: {},
    viewportGeometry: {
      clearViewportElement() {
        calls.push("clear-viewport-element");
      },
      refreshViewportElement() {
        calls.push("handle-structure-mutation");
      },
      destroy() {
        calls.push("destroy-viewport-geometry");
      },
    },
    mapViewResolver: {
      reset() {
        calls.push("reset-map-view");
      },
    },
    runBoundary: () => ({ ok: true }),
    createContext() {
      return {
        subscribe(listener) {
          pageContextListener = listener;
          return () => {
            calls.push("unsubscribe-page-context");
            pageContextListener = null;
          };
        },
        start() {
          calls.push("start-page-context");
        },
        syncObservedContext() {
          calls.push("sync-page-context");
        },
        destroy() {
          calls.push("destroy-page-context");
        },
      };
    },
    createSnapshotWatcher({ onInvalidate }) {
      watcherListener = onInvalidate;
      return {
        start() {
          calls.push("start-watcher");
        },
        stop() {
          calls.push("stop-watcher");
        },
      };
    },
    createSnapshotSource({ onFirstSubscriber, onNoSubscribers }) {
      return {
        subscribe(listener) {
          onFirstSubscriber();
          calls.push("notify-subscriber");
          listener({});
          return onNoSubscribers;
        },
        notifyIfChanged() {
          calls.push("notify-if-changed");
        },
        destroy() {
          calls.push("destroy-snapshot-source");
        },
      };
    },
  });
  return {
    graph,
    emit(event) {
      pageContextListener?.(event);
    },
    watcher: {
      emitObservation() {
        watcherListener?.({});
      },
    },
  };
}
