import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

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
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell restores panel chrome outside product hydration",
  });
  const durableState = durableImageState();
  const storage = createDurableStorageHarness({
    trace,
    durableState,
  });
  const panelChrome = createPanelChromeHarness({
    trace,
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
    trace,
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  const result = await startBrowserShell({ trace, host });

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
  assert.deepEqual(trace.edges, startupEdges());
});

// Class-b: restored panel chrome must be visible on the current page, but a
// viewport-specific clamp is render normalization, not a reason to rewrite the
// stored preference during startup.
test("browser shell clamps restored panel chrome for render without startup writeback", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell clamps restored panel chrome for render without startup writeback",
  });
  const panelChrome = createPanelChromeHarness({
    trace,
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
      trace,
      durableState: null,
    }).port,
    trace,
    panelChromePort: panelChrome.port,
  });

  await startBrowserShell({ trace, host });

  assert.deepEqual(host.latestRender.panelChrome, {
    position: {
      screenPx: {
        x: 560,
        y: 0,
      },
    },
  });
  assert.deepEqual(panelChrome.writes, []);
  assert.deepEqual(trace.edges, startupEdges());
});

// Class-b: malformed panel chrome is preference noise. It should recover to
// visible chrome without becoming an application hydration failure or causing a
// defensive rewrite of the user's product session.
test("browser shell normalizes unsupported panel chrome without touching durable state", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell normalizes unsupported panel chrome without touching durable state",
  });
  const expectedEdges = [];
  for (const [index, storedChrome] of [
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
  ].entries()) {
    const phase = `variant-${index}`;
    const storage = createDurableStorageHarness({
      trace,
      phase,
      durableState: durableImageState(),
    });
    const host = createBrowserHostHarness({
      trace,
      phase,
      durableStatePort: storage.port,
      panelChromePort: createPanelChromeHarness({
        trace,
        phase,
        storedChrome,
      }).port,
    });

    await startBrowserShell({ trace, host });

    assertSafeRenderedPanelChrome(host.latestRender.panelChrome);
    assert.deepEqual(storage.writes, []);
    expectedEdges.push(...startupEdges({ phase }));
  }
  assert.deepEqual(trace.edges, expectedEdges);
});

// Class-b: panel dragging is shell chrome persistence, not an application
// command. The browser shell may re-render after the drag, but the product
// runtime and durable session storage must remain unchanged.
test("browser shell panel drag writes only panel chrome", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell panel drag writes only panel chrome",
  });
  const durableState = durableImageState();
  const storage = createDurableStorageHarness({
    trace,
    durableState,
  });
  const panelChrome = createPanelChromeHarness({
    trace,
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
    trace,
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  const result = await startBrowserShell({ trace, host });
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
  assert.deepEqual(trace.edges, [
    ...startupEdges(),
    ...panelChromeWriteEdges(),
    flowEdge("source.panel-chrome-change", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

// Class-b: product commands may cause a render, but panel chrome is not part of
// product transition output. Re-rendering after mode changes must preserve the
// current shell preference without writing it again.
test("browser shell product commands preserve panel chrome without chrome writes", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell product commands preserve panel chrome without chrome writes",
  });
  const storage = createDurableStorageHarness({
    trace,
    durableState: durableImageState(),
  });
  const panelChrome = createPanelChromeHarness({
    trace,
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
    trace,
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "select-mode",
      mode: "trace",
    },
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
  assert.deepEqual(trace.edges, [
    ...startupEdges(),
    flowEdge("source.rendered-command.select-mode", "command.select-mode", {
      provider: "browser-shell-harness",
    }),
    ...durableWriteEdges(),
    flowEdge("source.rendered-command.select-mode", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

// Class-b: unsupported pages should have no panel-chrome lifecycle. Reading a
// user preference for a page where the extension does not mount would be hidden
// host work with no visible owner.
test("browser shell unsupported pages do not read panel chrome", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell unsupported pages do not read panel chrome",
  });
  const panelChrome = createPanelChromeHarness({
    trace,
    storedChrome: {
      position: {
        screenPx: {
          x: 16,
          y: 16,
        },
      },
    },
  });

  const result = await startBrowserShell({
    trace,
    host: createBrowserHostHarness({
      trace,
    pageContext: {
      kind: "unsupported-page",
    },
    panelChromePort: panelChrome.port,
    }),
  });

  assert.deepEqual(result, {
    kind: "unsupported-page",
  });
  assert.equal(panelChrome.readCount, 0);
  assert.deepEqual(panelChrome.writes, []);
  assert.deepEqual(trace.edges, [
    flowEdge("source.bootstrap-browser-extension", "inert.unsupported-page", {
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-b: panel chrome storage is shell preference storage. Failures should be
// visible to diagnostics, but they must not poison application state, prevent a
// safe render, or block later product commands.
test("browser shell keeps panel chrome storage failures outside application state", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell keeps panel chrome storage failures outside application state",
  });
  const readError = new Error("panel chrome read failed");
  const writeError = new Error("panel chrome write failed");
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: createDurableStorageHarness({
      trace,
      durableState: durableImageState(),
    }).port,
    panelChromePort: createFailingPanelChromeHarness({
      trace,
      readError,
      writeError,
    }).port,
  });

  const result = await startBrowserShell({ trace, host });
  await host.dispatchPanelChromeChange({
    position: {
      requestedScreenPx: {
        x: 80,
        y: 90,
      },
      panelSizePx: PANEL_SIZE_PX,
      viewportPx: VIEWPORT_PX,
    },
  });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "select-mode",
      mode: "trace",
    },
  });

  assertSafeRenderedPanelChrome(host.latestRender.panelChrome);
  assert.equal(result.runtime.getState().session.mode, "trace");
  assert.deepEqual(host.reportedErrors, [readError, writeError]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.bootstrap-browser-extension", "port.panel-chrome.read", {
      provider: "panel-chrome-port",
    }),
    flowEdge("port.panel-chrome.read", "sink.panel-chrome.read-error", {
      terminal: "port-error",
    }),
    ...startupDurableEdges(),
    flowEdge("source.bootstrap-browser-extension", "sink.render", {
      terminal: "view-result",
    }),
    flowEdge("source.panel-chrome-change", "port.panel-chrome.write", {
      provider: "panel-chrome-port",
    }),
    flowEdge("port.panel-chrome.write", "sink.panel-chrome.write-error", {
      terminal: "port-error",
    }),
    flowEdge("source.panel-chrome-change", "sink.render", {
      terminal: "view-result",
    }),
    flowEdge("source.rendered-command.select-mode", "command.select-mode", {
      provider: "browser-shell-harness",
    }),
    ...durableWriteEdges(),
    flowEdge("source.rendered-command.select-mode", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

function createBrowserHostHarness({
  trace,
  phase = undefined,
  pageContext = {
    kind: "supported-map-editor-page",
  },
  durableStatePort = createDurableStorageHarness({ trace, durableState: null }).port,
  panelChromePort = createPanelChromeHarness({ trace }).port,
}) {
  const reportedErrors = [];
  const attributes = edgeAttributes({ phase });
  return {
    pageContext,
    durableStatePort,
    panelChromePort,
    reportedErrors,
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
      trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-render", "sink.render", {
        ...attributes,
        terminal: "view-result",
      }));
      this.latestRender = render;
    },
    reportRuntimeError(error) {
      reportedErrors.push(error);
    },
    startRuntime(runtime) {
      return runtime;
    },
    async dispatchPanelChromeChange(change) {
      if (typeof this.handlePanelChromeChange !== "function") {
        throw new TypeError("browser shell did not expose panel chrome change dispatch");
      }
      await trace.withSource("source.panel-chrome-change", () => (
        this.handlePanelChromeChange(change)
      ));
    },
  };
}

async function startBrowserShell({ trace, host }) {
  return trace.withSource("source.bootstrap-browser-extension", async () => {
    const result = await bootstrapBrowserExtension(host);
    if (result.kind === "unsupported-page") {
      trace.edge(flowEdge("source.bootstrap-browser-extension", "inert.unsupported-page", {
        terminal: "intentionally-inert",
      }));
    }
    return result;
  });
}

async function dispatchRenderedCommand({ trace, dispatchCommand, command }) {
  const source = `source.rendered-command.${command.kind}`;
  trace.edge(flowEdge(source, `command.${command.kind}`, {
    provider: "browser-shell-harness",
  }));
  await trace.withSource(source, () => dispatchCommand(command));
}

function createDurableStorageHarness({
  trace,
  durableState,
  phase = undefined,
}) {
  const writes = [];
  let readCount = 0;
  const attributes = edgeAttributes({ phase });
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readDurableState() {
        readCount += 1;
        trace.edge(flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
          ...attributes,
          provider: "browser-shell-harness",
        }));
        trace.edge(flowEdge("port.durable-state.read", "sink.startup-durable-state", {
          ...attributes,
          terminal: "port-result",
        }));
        trace.edge(flowEdge("port.durable-state.read", "callback.startup-durable-state", {
          ...attributes,
          provider: "browser-shell-harness",
        }));
        trace.edge(flowEdge("callback.startup-durable-state", "command.hydrate", {
          ...attributes,
          provider: "browser-shell-harness",
        }));
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
          provider: "browser-shell-effect-handler",
        }));
        writes.push(nextDurableState);
        trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
          terminal: "durable-write",
        }));
      },
    },
  };
}

function createPanelChromeHarness({
  trace,
  storedChrome = null,
  phase = undefined,
} = {}) {
  const writes = [];
  let readCount = 0;
  const attributes = edgeAttributes({ phase });
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readPanelChrome() {
        readCount += 1;
        trace.edge(flowEdge("source.bootstrap-browser-extension", "port.panel-chrome.read", {
          ...attributes,
          provider: "panel-chrome-port",
        }));
        trace.edge(flowEdge("port.panel-chrome.read", "sink.panel-chrome.read", {
          ...attributes,
          terminal: "port-result",
        }));
        trace.edge(flowEdge("port.panel-chrome.read", "callback.panel-chrome-state", {
          ...attributes,
          provider: "panel-chrome-port",
        }));
        trace.edge(flowEdge("callback.panel-chrome-state", "sink.panel-chrome.state", {
          ...attributes,
          terminal: "shell-state",
        }));
        return storedChrome;
      },
      async writePanelChrome(panelChrome) {
        trace.edge(flowEdge("source.panel-chrome-change", "port.panel-chrome.write", {
          provider: "panel-chrome-port",
        }));
        writes.push(panelChrome);
        trace.edge(flowEdge("port.panel-chrome.write", "sink.panel-chrome.write", {
          terminal: "port-result",
        }));
      },
    },
  };
}

function createFailingPanelChromeHarness({ trace, readError, writeError }) {
  return {
    port: {
      async readPanelChrome() {
        trace.edge(flowEdge("source.bootstrap-browser-extension", "port.panel-chrome.read", {
          provider: "panel-chrome-port",
        }));
        trace.edge(flowEdge("port.panel-chrome.read", "sink.panel-chrome.read-error", {
          terminal: "port-error",
        }));
        throw readError;
      },
      async writePanelChrome() {
        trace.edge(flowEdge("source.panel-chrome-change", "port.panel-chrome.write", {
          provider: "panel-chrome-port",
        }));
        trace.edge(flowEdge("port.panel-chrome.write", "sink.panel-chrome.write-error", {
          terminal: "port-error",
        }));
        throw writeError;
      },
    },
  };
}

function startupEdges({ phase = undefined } = {}) {
  const attributes = edgeAttributes({ phase });
  return [
    ...panelChromeReadEdges({ phase }),
    ...startupDurableEdges({ phase }),
    flowEdge("source.bootstrap-browser-extension", "sink.render", {
      ...attributes,
      terminal: "view-result",
    }),
  ];
}

function panelChromeReadEdges({ phase = undefined } = {}) {
  const attributes = edgeAttributes({ phase });
  return [
    flowEdge("source.bootstrap-browser-extension", "port.panel-chrome.read", {
      ...attributes,
      provider: "panel-chrome-port",
    }),
    flowEdge("port.panel-chrome.read", "sink.panel-chrome.read", {
      ...attributes,
      terminal: "port-result",
    }),
    flowEdge("port.panel-chrome.read", "callback.panel-chrome-state", {
      ...attributes,
      provider: "panel-chrome-port",
    }),
    flowEdge("callback.panel-chrome-state", "sink.panel-chrome.state", {
      ...attributes,
      terminal: "shell-state",
    }),
  ];
}

function startupDurableEdges({ phase = undefined } = {}) {
  const attributes = edgeAttributes({ phase });
  return [
    flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
      ...attributes,
      provider: "browser-shell-harness",
    }),
    flowEdge("port.durable-state.read", "sink.startup-durable-state", {
      ...attributes,
      terminal: "port-result",
    }),
    flowEdge("port.durable-state.read", "callback.startup-durable-state", {
      ...attributes,
      provider: "browser-shell-harness",
    }),
    flowEdge("callback.startup-durable-state", "command.hydrate", {
      ...attributes,
      provider: "browser-shell-harness",
    }),
  ];
}

function panelChromeWriteEdges() {
  return [
    flowEdge("source.panel-chrome-change", "port.panel-chrome.write", {
      provider: "panel-chrome-port",
    }),
    flowEdge("port.panel-chrome.write", "sink.panel-chrome.write", {
      terminal: "port-result",
    }),
  ];
}

function durableWriteEdges() {
  return [
    flowEdge("effect.persist-durable-state", "port.durable-state.write", {
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.durable-state.write", "sink.durable-state.write", {
      terminal: "durable-write",
    }),
  ];
}

function edgeAttributes({ phase }) {
  return phase === undefined ? {} : { phase };
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
