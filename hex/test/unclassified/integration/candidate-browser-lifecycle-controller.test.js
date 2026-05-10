import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: candidate boundary law for the browser lifecycle controller.
//
// Rejected alternatives:
// - A module-level WeakMap bootstrap registry. It gives idempotence, but hides
//   lifetime and makes stop/restart/disposal behavior implicit.
// - Letting each adapter self-start. That scatters listener ownership and makes
//   it unclear who cancels late browser work.
// - Letting the runtime own browser resources. The runtime sequences product
//   commands and declared effects; it should not know DOM roots, listeners, or
//   page eligibility.
// - Letting bootstrap watch product state. That would recreate effect handling
//   and transient lifecycle rules outside the application/runtime boundary.
//
// Preferred model: one explicit browser lifecycle controller owns start/stop for
// the page instance. It gates unsupported pages, mounts the owned root, hydrates
// through the application command boundary, renders from the view model, binds
// input after the first render, runs only declared effects, and disposes every
// browser subscription exactly once.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const BOOTSTRAP_INDEX = path.join(REPO_ROOT, "hex/bootstrap/index.js");

// Candidate: unsupported pages are outside the lifecycle. The controller should
// not mount UI, create runtime state, read storage, bind input, or render an
// inert shell that looks alive.
test("candidate: unsupported page performs no lifecycle work", async () => {
  const host = createLifecycleHostHarness({
    pageContext: {
      kind: "unsupported-page",
    },
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(result, {
    kind: "unsupported-page",
  });
  assert.deepEqual(host.events, []);
});

// Candidate: start is a lifecycle transition, not a constructor call. Repeated
// start for the same live page must reuse the same running session and must not
// duplicate roots, runtimes, storage reads, renders, or browser listeners.
test("candidate: supported page start is idempotent and binds input once after first render", async () => {
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

// Candidate: stop is part of the contract, not an implementation detail. It
// disposes every browser-owned resource exactly once and removes the running
// session so a future start is a fresh lifecycle, not a stale WeakMap hit.
test("candidate: dispose is idempotent and allows a fresh later start", async () => {
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

// Candidate: stale UI callbacks are a lifecycle concern. Once the page instance
// is stopped, callbacks captured by an old render must not dispatch product
// commands, persist effects, or re-render a root that has been disposed.
test("candidate: stale rendered dispatch is inert after dispose", async () => {
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

// Candidate: lifecycle should be explicit in source structure. A hidden global
// host registry can make repeated start look correct while leaving stop/restart,
// page unload, and late async callback behavior underspecified.
test("candidate: bootstrap delegates lifecycle to an explicit controller instead of a hidden registry", () => {
  const source = fs.readFileSync(BOOTSTRAP_INDEX, "utf8");

  assert.equal(source.includes("WeakMap"), false);
  assert.match(source, /createBrowserLifecycleController/);
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
