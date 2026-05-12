import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: explicit lifecycle ownership is likely the right direction, but this
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

function createLifecycleHostHarness({
  pageContext,
  durableState = null,
}) {
  const events = [];
  const storageWrites = [];
  let latestRender = null;
  let renderCount = 0;

  return {
    pageContext,
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
