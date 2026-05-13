import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: the user-visible lifecycle is stable, but the port shape is not.
// Initial page support detection is already class-b; this candidate goes further
// and invents `pageContextPort.subscribePageContextChanged`, root removal, and
// runtime reset semantics. Promote only after the shell has one explicit
// page-context observation port and one explicit ownership/disposal policy.
test("becoming unsupported disposes the owned UI root and runtime listeners", async () => {
  const pageContext = createPageContextHarness({
    initialContext: {
      kind: "supported-map-editor-page",
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState(),
    }).port,
    pageContextPort: pageContext.port,
  });

  const bootstrap = await bootstrapBrowserExtension(host);
  assert.equal(host.countOwnedRoots("id-overlay"), 1);

  await pageContext.emit({
    kind: "unsupported-page",
  });

  assert.equal(host.countOwnedRoots("id-overlay"), 0);
  assert.equal(bootstrap.runtime.getState().session, undefined);
  assert.equal(pageContext.disposeCount, 1);
});

// Unclassified candidate: SPA recovery is a real browser behavior, but this test should not be
// the thing that chooses whether unsupported startup returns a dormant bootstrap,
// a disposer, or a subscribed shell controller. Keep it unclassified until that
// lifecycle boundary is named once and reused by both supported->unsupported and
// unsupported->supported transitions.
test("becoming supported after unsupported startup mounts the extension once", async () => {
  const pageContext = createPageContextHarness({
    initialContext: {
      kind: "unsupported-page",
    },
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "unsupported-page",
    },
    durableStatePort: createDurableStorageHarness({
      durableState: null,
    }).port,
    pageContextPort: pageContext.port,
  });

  await bootstrapBrowserExtension(host);
  await pageContext.emit({
    kind: "supported-map-editor-page",
  });

  assert.equal(host.countOwnedRoots("id-overlay"), 1);
  assert.equal(host.latestRender.view.primaryAction.label, "Paste");
});

function createBrowserHostHarness({
  pageContext = {
    kind: "supported-map-editor-page",
  },
  durableStatePort,
  pageContextPort,
}) {
  const ownedRoots = new Map();
  return {
    pageContext,
    durableStatePort,
    pageContextPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      const ownedRoot = {
        ...root,
        ownerId,
      };
      ownedRoots.set(ownerId, ownedRoot);
      return ownedRoot;
    },
    removeOwnedRoot(ownerId) {
      ownedRoots.delete(ownerId);
    },
    countOwnedRoots(ownerId) {
      return ownedRoots.has(ownerId) ? 1 : 0;
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  return {
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState() {},
    },
  };
}

function durableImageState() {
  return {
    session: {
      mode: "align",
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

function createPageContextHarness({ initialContext }) {
  let listener = null;
  let disposeCount = 0;
  return {
    get disposeCount() {
      return disposeCount;
    },
    port: {
      readPageContext() {
        return initialContext;
      },
      subscribePageContextChanged(nextListener) {
        listener = nextListener;
        return () => {
          disposeCount += 1;
        };
      },
    },
    async emit(pageContext) {
      assert.equal(typeof listener, "function", "page context changes were not observed");
      await listener(pageContext);
    },
  };
}
