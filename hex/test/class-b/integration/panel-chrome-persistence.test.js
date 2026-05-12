import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b: panel chrome is browser-shell preference, not product state. The
// exact port/render payload may evolve, but startup must keep durable product
// hydration and panel chrome restoration as separate streams.
test("browser shell restores panel chrome outside product hydration", async () => {
  const durableState = durableImageState();
  const storage = createDurableStorageHarness({
    durableState,
  });
  const panelChrome = createPanelChromeHarness({
    storedChrome: {
      position: {
        screenPx: {
          x: 24,
          y: 32,
        },
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.equal(storage.readCount, 1);
  assert.equal(panelChrome.readCount, 1);
  assert.deepEqual(result.runtime.getState(), {
    session: durableState.session,
  });
  assert.deepEqual(host.latestRender.panelChrome, {
    position: {
      screenPx: {
        x: 24,
        y: 32,
      },
    },
  });
  assert.equal(JSON.stringify(result.runtime.getState()).includes("panel"), false);
});

function createBrowserHostHarness({
  pageContext = {
    kind: "supported-map-editor-page",
  },
  durableStatePort = createDurableStorageHarness({ durableState: null }).port,
  panelChromePort = createPanelChromeHarness().port,
}) {
  return {
    pageContext,
    durableStatePort,
    panelChromePort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
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
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    port: {
      async readDurableState() {
        readCount += 1;
        return durableState;
      },
      async writeDurableState() {},
    },
  };
}

function createPanelChromeHarness({ storedChrome = null } = {}) {
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    port: {
      async readPanelChrome() {
        readCount += 1;
        return storedChrome;
      },
      async writePanelChrome() {},
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
