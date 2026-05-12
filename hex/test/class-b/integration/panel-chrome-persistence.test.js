import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

const VIEWPORT_PX = Object.freeze({
  width: 800,
  height: 600,
});

const PANEL_SIZE_PX = Object.freeze({
  width: 240,
  height: 120,
});

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

// Class-b: restored panel chrome must be visible on the current page, but a
// viewport-specific clamp is render normalization, not a reason to rewrite the
// stored preference during startup.
test("browser shell clamps restored panel chrome for render without startup writeback", async () => {
  const panelChrome = createPanelChromeHarness({
    storedChrome: {
      position: {
        screenPx: {
          x: 9999,
          y: -40,
        },
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: null,
    }).port,
    panelChromePort: panelChrome.port,
  });

  await bootstrapBrowserExtension(host);

  assert.deepEqual(host.latestRender.panelChrome, {
    position: {
      screenPx: {
        x: 560,
        y: 0,
      },
    },
  });
  assert.deepEqual(panelChrome.writes, []);
});

// Class-b: malformed panel chrome is preference noise. It should recover to
// visible chrome without becoming an application hydration failure or causing a
// defensive rewrite of the user's product session.
test("browser shell normalizes unsupported panel chrome without touching durable state", async () => {
  for (const storedChrome of [
    null,
    {},
    {
      position: {
        screenPx: {
          x: Number.NaN,
          y: 20,
        },
      },
    },
    {
      position: {
        screenPx: {
          x: 20,
          y: Infinity,
        },
      },
    },
  ]) {
    const storage = createDurableStorageHarness({
      durableState: durableImageState(),
    });
    const host = createBrowserHostHarness({
      durableStatePort: storage.port,
      panelChromePort: createPanelChromeHarness({
        storedChrome,
      }).port,
    });

    await bootstrapBrowserExtension(host);

    assertSafeRenderedPanelChrome(host.latestRender.panelChrome);
    assert.deepEqual(storage.writes, []);
  }
});

// Class-b: panel dragging is shell chrome persistence, not an application
// command. The browser shell may re-render after the drag, but the product
// runtime and durable session storage must remain unchanged.
test("browser shell panel drag writes only panel chrome", async () => {
  const durableState = durableImageState();
  const storage = createDurableStorageHarness({
    durableState,
  });
  const panelChrome = createPanelChromeHarness({
    storedChrome: {
      position: {
        screenPx: {
          x: 16,
          y: 16,
        },
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.dispatchPanelChromeChange({
    position: {
      requestedScreenPx: {
        x: 700,
        y: 580,
      },
      panelSizePx: PANEL_SIZE_PX,
      viewportPx: VIEWPORT_PX,
    },
  });

  assert.deepEqual(panelChrome.writes, [{
    position: {
      screenPx: {
        x: 560,
        y: 480,
      },
    },
  }]);
  assert.deepEqual(result.runtime.getState(), {
    session: durableState.session,
  });
  assert.deepEqual(storage.writes, []);
});

// Class-b: product commands may cause a render, but panel chrome is not part of
// product transition output. Re-rendering after mode changes must preserve the
// current shell preference without writing it again.
test("browser shell product commands preserve panel chrome without chrome writes", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState(),
  });
  const panelChrome = createPanelChromeHarness({
    storedChrome: {
      position: {
        screenPx: {
          x: 44,
          y: 55,
        },
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.deepEqual(host.latestRender.panelChrome, {
    position: {
      screenPx: {
        x: 44,
        y: 55,
      },
    },
  });
  assert.deepEqual(panelChrome.writes, []);
  assert.deepEqual(storage.writes, [{
    session: {
      ...durableImageState().session,
      mode: "trace",
    },
  }]);
});

// Class-b: unsupported pages should have no panel-chrome lifecycle. Reading a
// user preference for a page where the extension does not mount would be hidden
// host work with no visible owner.
test("browser shell unsupported pages do not read panel chrome", async () => {
  const panelChrome = createPanelChromeHarness({
    storedChrome: {
      position: {
        screenPx: {
          x: 16,
          y: 16,
        },
      },
    },
  });

  const result = await bootstrapBrowserExtension(createBrowserHostHarness({
    pageContext: {
      kind: "unsupported-page",
    },
    panelChromePort: panelChrome.port,
  }));

  assert.deepEqual(result, {
    kind: "unsupported-page",
  });
  assert.equal(panelChrome.readCount, 0);
  assert.deepEqual(panelChrome.writes, []);
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
    pageViewportPx: VIEWPORT_PX,
    panelSizePx: PANEL_SIZE_PX,
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
    async dispatchPanelChromeChange(change) {
      if (typeof this.handlePanelChromeChange !== "function") {
        throw new TypeError("browser shell did not expose panel chrome change dispatch");
      }
      await this.handlePanelChromeChange(change);
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  const writes = [];
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readDurableState() {
        readCount += 1;
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}

function createPanelChromeHarness({ storedChrome = null } = {}) {
  const writes = [];
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readPanelChrome() {
        readCount += 1;
        return storedChrome;
      },
      async writePanelChrome(panelChrome) {
        writes.push(panelChrome);
      },
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

function assertSafeRenderedPanelChrome(panelChrome) {
  const screenPx = panelChrome?.position?.screenPx;
  assert.equal(Number.isFinite(screenPx?.x), true);
  assert.equal(Number.isFinite(screenPx?.y), true);
  assert.equal(screenPx.x >= 0, true);
  assert.equal(screenPx.y >= 0, true);
  assert.equal(screenPx.x <= VIEWPORT_PX.width - PANEL_SIZE_PX.width, true);
  assert.equal(screenPx.y <= VIEWPORT_PX.height - PANEL_SIZE_PX.height, true);
}
