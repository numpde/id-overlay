import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: panel position is shell chrome, not product state. Dragging the
// panel should write through a panel-position adapter while leaving application
// state and durable image state untouched.
test("candidate: panel drag persists shell position without changing app state", async () => {
  const durableState = durableImageState();
  const storage = createDurableStorageHarness({
    durableState,
  });
  const panelPosition = createPanelPositionHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    panelPositionPort: panelPosition.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.dispatchPanelDrag({
    fromScreenPx: {
      x: 10,
      y: 20,
    },
    toScreenPx: {
      x: 40,
      y: 70,
    },
  });

  assert.deepEqual(panelPosition.writes, [{
    x: 30,
    y: 50,
  }]);
  assert.deepEqual(result.runtime.getState(), durableState);
  assert.deepEqual(storage.writes, []);
});

// Unclassified: if panel chrome position becomes durable, it must stay outside
// application durable state. Startup may read shell position, but hydration must
// still see only product durable state.
test("candidate: startup restores panel chrome position outside product hydration", async () => {
  const panelPosition = createPanelPositionHarness({
    initialPosition: {
      x: 24,
      y: 32,
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: null,
    }).port,
    panelPositionPort: panelPosition.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(panelPosition.reads, ["panel-position"]);
  assert.deepEqual(host.latestRender.panelPosition, {
    x: 24,
    y: 32,
  });
  assert.deepEqual(result.runtime.getState(), {});
});

function createBrowserHostHarness({ durableStatePort, panelPositionPort }) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    panelPositionPort,
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
    async dispatchPanelDrag(drag) {
      if (typeof this.handlePanelDrag !== "function") {
        throw new TypeError("browser shell did not expose panel-drag dispatch");
      }
      await this.handlePanelDrag(drag);
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}

function createPanelPositionHarness({ initialPosition = null } = {}) {
  const writes = [];
  const reads = [];
  return {
    reads,
    writes,
    port: {
      async readPanelPosition() {
        reads.push("panel-position");
        return initialPosition;
      },
      async writePanelPosition(position) {
        writes.push(position);
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
