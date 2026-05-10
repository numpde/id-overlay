import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createDurableStorageHarness,
  durableImageState,
} from "./candidate-browser-harness.js";

// Unclassified: page-context observation may be polling, mutation-driven, or
// routed through the editor frame. The shell contract is stable: support
// changes are lifecycle facts, not a reason to leave stale overlay UI mounted.
test("candidate: becoming unsupported disposes the owned UI root and runtime listeners", async () => {
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

// Unclassified: startup on an unsupported route should not permanently poison
// the tab. If the page later enters the supported iD editor route, bootstrap
// should mount exactly one extension instance.
test("candidate: becoming supported after unsupported startup mounts the extension once", async () => {
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
