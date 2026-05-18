import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: legacy content sessions were tied to the owner window with one
// active beforeunload teardown. The shell may implement restart as reuse or
// replacement, but repeated supported starts must not accumulate page-lifetime
// listeners.
test("browser session keeps one active owner-window teardown across repeated starts", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser session keeps one active owner-window teardown across repeated starts",
  });
  const ownerWindow = createWindowLifecycleHarness({ trace });
  const host = createBrowserSessionHostHarness({
    ownerWindow,
    trace,
  });

  await startBrowserSession({ trace, host });
  await startBrowserSession({ trace, host });

  assert.equal(ownerWindow.listenerCount("beforeunload"), 1);
  assert.deepEqual(trace.edges, [
    flowEdge("source.bootstrap-browser-extension", "sink.owned-root.mount", {
      terminal: "shell-resource",
    }),
    flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
      provider: "browser-session-harness",
    }),
    flowEdge("source.bootstrap-browser-extension", "sink.runtime.start", {
      terminal: "shell-resource",
    }),
    flowEdge("source.bootstrap-browser-extension", "callback.owner-window.beforeunload", {
      provider: "browser-session-harness",
    }),
    flowEdge("source.bootstrap-browser-extension", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

// Class-b: browser-session lifecycle owns shell resources. Teardown removes the
// owner-window listener and disposes the active root/runtime once; product
// disposal semantics remain covered by runtime laws.
test("owner-window teardown disposes active browser-session resources once", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "owner-window teardown disposes active browser-session resources once",
  });
  const ownerWindow = createWindowLifecycleHarness({ trace });
  const host = createBrowserSessionHostHarness({
    ownerWindow,
    trace,
  });

  await startBrowserSession({ trace, host });
  ownerWindow.dispatch("beforeunload");
  ownerWindow.dispatch("beforeunload");

  assert.equal(ownerWindow.listenerCount("beforeunload"), 0);
  assert.equal(countEvents(host.events, "dispose-host"), 1);
  assert.equal(countEvents(host.events, "dispose-root:id-overlay"), 1);
  assert.equal(countEvents(host.events, "dispose-runtime"), 1);
  assert.deepEqual(trace.edges.slice(-4), [
    flowEdge("source.owner-window.beforeunload", "callback.owner-window.beforeunload", {
      provider: "browser-session-harness",
    }),
    flowEdge("callback.owner-window.beforeunload", "sink.browser-host.dispose", {
      terminal: "shell-resource-disposed",
    }),
    flowEdge("callback.owner-window.beforeunload", "sink.owned-root.dispose", {
      terminal: "shell-resource-disposed",
    }),
    flowEdge("callback.owner-window.beforeunload", "sink.runtime.dispose", {
      terminal: "shell-resource-disposed",
    }),
  ]);
});

// Class-b: once the page-owned session is torn down, stale UI callbacks from a
// previously rendered view must not re-enter the app, render, or persist state.
test("stale rendered dispatch is inert after owner-window teardown", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "stale rendered dispatch is inert after owner-window teardown",
  });
  const ownerWindow = createWindowLifecycleHarness({ trace });
  const host = createBrowserSessionHostHarness({
    ownerWindow,
    trace,
    durableState: durableImageState({
      mode: "align",
    }),
  });

  await startBrowserSession({ trace, host });
  const staleDispatch = host.latestRender.dispatchCommand;

  ownerWindow.dispatch("beforeunload");
  await dispatchStaleRenderedCommand({
    trace,
    dispatch: staleDispatch,
    command: {
    kind: "select-mode",
    mode: "trace",
    },
  });

  assert.deepEqual(host.storageWrites, []);
  assert.equal(host.renderCount, 1);
  assert.deepEqual(trace.edges.slice(-1), [
    flowEdge("source.stale-rendered-command", "inert.disposed-browser-session", {
      terminal: "intentionally-inert",
    }),
  ]);
});

function createBrowserSessionHostHarness({
  ownerWindow = createWindowLifecycleHarness(),
  durableState = null,
  pageContext = {
    kind: "supported-map-editor-page",
  },
  trace = createFlowTrace(),
} = {}) {
  const events = [];
  const storageWrites = [];
  let latestRender = null;
  let renderCount = 0;

  return {
    pageContext,
    ownerWindow,
    events,
    storageWrites,
    get latestRender() {
      return latestRender;
    },
    get renderCount() {
      return renderCount;
    },
    durableStatePort: {
      async readDurableState() {
        trace.edge(flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
          provider: "browser-session-harness",
        }));
        events.push("read-durable-state");
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        trace.edge(flowEdge("command.select-mode", "sink.durable-state.write", {
          terminal: "durable-write",
        }));
        storageWrites.push(nextDurableState);
        events.push("write-durable-state");
      },
    },
    mountOwnedRoot(ownerId, root) {
      trace.edge(flowEdge("source.bootstrap-browser-extension", "sink.owned-root.mount", {
        terminal: "shell-resource",
      }));
      events.push(`mount-root:${ownerId}`);
      return {
        ...root,
        ownerId,
        dispose() {
          trace.edge(flowEdge(trace.activeSource() ?? "source.shell-dispose", "sink.owned-root.dispose", {
            terminal: "shell-resource-disposed",
          }));
          events.push(`dispose-root:${ownerId}`);
        },
      };
    },
    renderApplicationView(render) {
      trace.edge(flowEdge(trace.activeSource() ?? "source.bootstrap-browser-extension", "sink.render", {
        terminal: "view-result",
      }));
      events.push("render");
      renderCount += 1;
      latestRender = render;
    },
    startRuntime(runtime) {
      trace.edge(flowEdge("source.bootstrap-browser-extension", "sink.runtime.start", {
        terminal: "shell-resource",
      }));
      events.push("start-runtime");
      const originalDispose = runtime.dispose?.bind(runtime);
      return {
        ...runtime,
        dispose() {
          trace.edge(flowEdge(trace.activeSource() ?? "source.shell-dispose", "sink.runtime.dispose", {
            terminal: "shell-resource-disposed",
          }));
          events.push("dispose-runtime");
          originalDispose?.();
        },
      };
    },
    dispose() {
      trace.edge(flowEdge(trace.activeSource() ?? "source.shell-dispose", "sink.browser-host.dispose", {
        terminal: "shell-resource-disposed",
      }));
      events.push("dispose-host");
    },
  };
}

async function startBrowserSession({ trace, host }) {
  return trace.withSource("source.bootstrap-browser-extension", () => (
    bootstrapBrowserExtension(host)
  ));
}

async function dispatchStaleRenderedCommand({ trace, dispatch, command }) {
  await trace.withSource("source.stale-rendered-command", () => dispatch(command));
  trace.edge(flowEdge("source.stale-rendered-command", "inert.disposed-browser-session", {
    terminal: "intentionally-inert",
  }));
}

function createWindowLifecycleHarness({ trace = createFlowTrace() } = {}) {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      trace.edge(flowEdge("source.bootstrap-browser-extension", `callback.owner-window.${type}`, {
        provider: "browser-session-harness",
      }));
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
      );
    },
    listenerCount(type) {
      return listeners.get(type)?.length ?? 0;
    },
    dispatch(type) {
      trace.withSource(`source.owner-window.${type}`, () => {
        const activeListeners = listeners.get(type) ?? [];
        if (activeListeners.length === 0) {
          return;
        }
        const callbackNode = `callback.owner-window.${type}`;
        trace.edge(flowEdge(`source.owner-window.${type}`, callbackNode, {
          provider: "browser-session-harness",
        }));
        for (const listener of activeListeners) {
          trace.withSource(callbackNode, () => {
            listener({
              type,
            });
          });
        }
      });
    },
  };
}

function countEvents(events, expectedEvent) {
  return events.filter((event) => event === expectedEvent).length;
}

function durableImageState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
