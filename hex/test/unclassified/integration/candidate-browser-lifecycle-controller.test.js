import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BOOTSTRAP_INDEX = path.join(REPO_ROOT, "bootstrap/index.js");

// Unclassified candidate: explicit lifecycle ownership is likely the right direction, but this
// test chooses concrete API shape too early: returned `dispose`, host
// `bindBrowserInput`, and exact event ordering. Promote only after the browser
// lifecycle controller exists as a named boundary rather than an inferred
// bootstrap behavior.
test("supported page start is idempotent and binds input once after first render", async () => {
  const host = createLifecycleHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
  });

  const first = await bootstrapBrowserExtension(host);
  const second = await bootstrapBrowserExtension(host);

  assert.equal(first, second);
  assert.equal(typeof first.dispose, "function");
  assertEventCounts(host.events, {
    "mount-root:id-overlay": 1,
    "start-runtime": 1,
    "read-durable-state": 1,
    render: 1,
    "bind-input": 1,
  });
  assertEventBefore(host.events, "read-durable-state", "render");
  assertEventBefore(host.events, "render", "bind-input");
});

// Unclassified candidate: disposal is the right lifecycle concern, but this test still fixes
// the public shape before the controller exists. Keep it unclassified until
// start/stop/restart are explicit browser-lifecycle operations.
test("dispose is idempotent and allows a fresh later start", async () => {
  const host = createLifecycleHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
  });

  const first = await bootstrapBrowserExtension(host);
  first.dispose();
  first.dispose();
  const second = await bootstrapBrowserExtension(host);

  assert.notEqual(second, first);
  assertEventCounts(host.events, {
    "mount-root:id-overlay": 2,
    "start-runtime": 2,
    "read-durable-state": 2,
    render: 2,
    "bind-input": 2,
    "dispose-input": 1,
    "dispose-root:id-overlay": 1,
    "dispose-runtime": 1,
  });
  assertEventBefore(host.events, "bind-input", "dispose-input");
  assertEventBefore(host.events, "dispose-input", "mount-root:id-overlay", {
    occurrence: 2,
  });
});

// Unclassified candidate: stale UI callbacks must become inert after stop, but the exact
// callback invalidation mechanism belongs to the future lifecycle controller.
// This should be promoted only with the controller, not as a bootstrap accident.
test("stale rendered dispatch is inert after dispose", async () => {
  const host = createLifecycleHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableState: durableImageState({
      mode: "align",
    }),
  });

  const bootstrap = await bootstrapBrowserExtension(host);
  const staleDispatch = host.latestRender.dispatchCommand;
  bootstrap.dispose();

  await staleDispatch({
    kind: "select-mode",
    mode: "trace",
  });

  assert.deepEqual(host.storageWrites, []);
  assert.equal(host.renderCount, 1);
});

// Unclassified candidate: the legacy app tied the active content session to the
// page lifetime with one beforeunload teardown. This keeps the behavior visible
// without freezing whether teardown is exposed through `dispose`, an owner
// window port, or a higher-level browser lifecycle controller.
test("owner window beforeunload tears down the active browser session once", async () => {
  const ownerWindow = createWindowLifecycleHarness();
  const host = createLifecycleHostHarness({
    ownerWindow,
    pageContext: {
      kind: "supported-map-editor-page",
    },
  });

  await bootstrapBrowserExtension(host);

  assert.equal(ownerWindow.listenerCount("beforeunload"), 1);

  ownerWindow.dispatch("beforeunload");
  ownerWindow.dispatch("beforeunload");

  assert.equal(ownerWindow.listenerCount("beforeunload"), 0);
  assertEventCounts(host.events, {
    "mount-root:id-overlay": 1,
    "start-runtime": 1,
    "read-durable-state": 1,
    render: 1,
    "bind-input": 1,
    "dispose-input": 1,
    "dispose-root:id-overlay": 1,
    "dispose-runtime": 1,
  });
  assertEventBefore(host.events, "bind-input", "dispose-input");
});

// Unclassified candidate: this is the desired lifecycle cut-over, but source-name assertions
// are not authority. Keep it unclassified until an explicit lifecycle controller
// is real and behavior tests, not a magic function name, define the boundary.
test("bootstrap delegates lifecycle to an explicit controller instead of a hidden registry", () => {
  const source = fs.readFileSync(BOOTSTRAP_INDEX, "utf8");

  assert.equal(source.includes("WeakMap"), false);
  assert.match(source, /createBrowserLifecycleController/);
});

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

function createLifecycleHostHarness({
  ownerWindow = createWindowLifecycleHarness(),
  pageContext,
  durableState = null,
}) {
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
    bindBrowserInput() {
      events.push("bind-input");
      return () => {
        events.push("dispose-input");
      };
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

function assertEventCounts(events, expectedCounts) {
  const expectedEvents = new Set(Object.keys(expectedCounts));
  assert.deepEqual(
    events.filter((event) => !expectedEvents.has(event)),
    [],
    "unexpected lifecycle events",
  );
  assert.deepEqual(Object.fromEntries(
    Object.keys(expectedCounts).map((event) => [
      event,
      events.filter((observedEvent) => observedEvent === event).length,
    ]),
  ), expectedCounts);
}

function assertEventBefore(events, earlierEvent, laterEvent, {
  occurrence = 1,
} = {}) {
  const earlierIndex = nthIndexOf(events, earlierEvent, 1);
  const laterIndex = nthIndexOf(events, laterEvent, occurrence);

  assert.notEqual(earlierIndex, -1, `missing event: ${earlierEvent}`);
  assert.notEqual(laterIndex, -1, `missing event: ${laterEvent}`);
  assert.equal(
    earlierIndex < laterIndex,
    true,
    `${earlierEvent} should happen before ${laterEvent}`,
  );
}

function nthIndexOf(values, value, occurrence) {
  let seen = 0;
  for (const [index, observedValue] of values.entries()) {
    if (observedValue !== value) {
      continue;
    }
    seen += 1;
    if (seen === occurrence) {
      return index;
    }
  }
  return -1;
}
