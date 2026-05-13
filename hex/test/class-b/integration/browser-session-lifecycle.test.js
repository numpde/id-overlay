import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b: legacy content sessions were tied to the owner window with one
// active beforeunload teardown. The shell may implement restart as reuse or
// replacement, but repeated supported starts must not accumulate page-lifetime
// listeners.
test("browser session keeps one active owner-window teardown across repeated starts", async () => {
  const ownerWindow = createWindowLifecycleHarness();
  const host = createBrowserSessionHostHarness({
    ownerWindow,
  });

  await bootstrapBrowserExtension(host);
  await bootstrapBrowserExtension(host);

  assert.equal(ownerWindow.listenerCount("beforeunload"), 1);
});

// Class-b: browser-session lifecycle owns shell resources. Teardown removes the
// owner-window listener and disposes the active root/runtime once; product
// disposal semantics remain covered by runtime laws.
test("owner-window teardown disposes active browser-session resources once", async () => {
  const ownerWindow = createWindowLifecycleHarness();
  const host = createBrowserSessionHostHarness({
    ownerWindow,
  });

  await bootstrapBrowserExtension(host);
  ownerWindow.dispatch("beforeunload");
  ownerWindow.dispatch("beforeunload");

  assert.equal(ownerWindow.listenerCount("beforeunload"), 0);
  assert.equal(countEvents(host.events, "dispose-root:id-overlay"), 1);
  assert.equal(countEvents(host.events, "dispose-runtime"), 1);
});

// Class-b: once the page-owned session is torn down, stale UI callbacks from a
// previously rendered view must not re-enter the app, render, or persist state.
test("stale rendered dispatch is inert after owner-window teardown", async () => {
  const ownerWindow = createWindowLifecycleHarness();
  const host = createBrowserSessionHostHarness({
    ownerWindow,
    durableState: durableImageState({
      mode: "align",
    }),
  });

  await bootstrapBrowserExtension(host);
  const staleDispatch = host.latestRender.dispatchCommand;

  ownerWindow.dispatch("beforeunload");
  await staleDispatch({
    kind: "select-mode",
    mode: "trace",
  });

  assert.deepEqual(host.storageWrites, []);
  assert.equal(host.renderCount, 1);
});

function createBrowserSessionHostHarness({
  ownerWindow = createWindowLifecycleHarness(),
  durableState = null,
  pageContext = {
    kind: "supported-map-editor-page",
  },
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
        events.push("read-durable-state");
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        storageWrites.push(nextDurableState);
        events.push("write-durable-state");
      },
    },
    mountOwnedRoot(ownerId, root) {
      events.push(`mount-root:${ownerId}`);
      return {
        ...root,
        ownerId,
        dispose() {
          events.push(`dispose-root:${ownerId}`);
        },
      };
    },
    renderApplicationView(render) {
      events.push("render");
      renderCount += 1;
      latestRender = render;
    },
    startRuntime(runtime) {
      events.push("start-runtime");
      const originalDispose = runtime.dispose?.bind(runtime);
      return {
        ...runtime,
        dispose() {
          events.push("dispose-runtime");
          originalDispose?.();
        },
      };
    },
  };
}

function createWindowLifecycleHarness() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
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
      for (const listener of listeners.get(type) ?? []) {
        listener({
          type,
        });
      }
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
