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
    "notify-if-changed",
    "handle-structure-mutation",
    "clear-viewport-element",
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
  ]);
});

function createObservationGraphHarness(calls) {
  let pageContextListener = null;
  const graph = createPageObservationGraph({
    hashTarget: {},
    viewportDocument: {},
    viewportGeometry: {
      clearViewportElement() {
        calls.push("clear-viewport-element");
      },
    },
    mapViewResolver: {},
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
      };
    },
    createSnapshotSource() {
      return {
        notifyIfChanged() {
          calls.push("notify-if-changed");
        },
        handleStructureMutation() {
          calls.push("handle-structure-mutation");
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
  };
}
