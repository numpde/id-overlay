import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: storage is a browser-shell adapter. The
// retry/backoff UX can change, but the no-regret boundary is fixed: read failure
// is reported outside the product reducer and falls back to the canonical empty
// UI instead of making the extension disappear.
test("startup storage read failure reports an error and renders empty UI", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "startup storage read failure reports an error and renders empty UI",
  });
  const readError = new Error("storage read exploded");
  const storage = createDurableStorageHarness({
    trace,
    durableState: null,
    readError,
  });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
  });

  const result = await startBrowserShell({ trace, host });

  assert.deepEqual(result.runtime.getState(), {});
  assert.equal(host.latestRender.view.primaryAction.label, "Paste");
  assert.deepEqual(host.reportedErrors, [readError]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
      provider: "browser-shell-harness",
    }),
    flowEdge("port.durable-state.read", "sink.host-error", {
      terminal: "host-error",
    }),
    flowEdge("source.bootstrap-browser-extension", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

// Class-b, deliberately not class-a: persistence failure is adapter failure, not
// product veto. The command has already changed in-memory state; the shell must
// report the failed write separately and keep rendering later valid commands.
test("storage write failure is reported without killing later renders", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "storage write failure is reported without killing later renders",
  });
  const writeError = new Error("storage write exploded");
  const storage = createDurableStorageHarness({
    trace,
    durableState: durableImageState({
      mode: "align",
    }),
    writeError,
  });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
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
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
    kind: "select-mode",
    mode: "trace",
    },
  });

  assert.equal(host.latestRender.view.mode, "trace");
  assert.deepEqual(host.reportedErrors, [writeError]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
      provider: "browser-shell-harness",
    }),
    flowEdge("port.durable-state.read", "sink.startup-durable-state", {
      terminal: "port-result",
    }),
    flowEdge("port.durable-state.read", "callback.startup-durable-state", {
      provider: "browser-shell-harness",
    }),
    flowEdge("callback.startup-durable-state", "command.hydrate", {
      provider: "browser-shell-harness",
    }),
    flowEdge("source.bootstrap-browser-extension", "sink.render", {
      terminal: "view-result",
    }),
    flowEdge("source.rendered-command.select-mode", "command.select-mode", {
      phase: "change-mode",
      provider: "browser-shell-harness",
    }),
    flowEdge("effect.persist-durable-state", "port.durable-state.write", {
      phase: "change-mode",
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.durable-state.write", "sink.host-error", {
      phase: "change-mode",
      terminal: "host-error",
    }),
    flowEdge("source.rendered-command.select-mode", "sink.render", {
      phase: "change-mode",
      terminal: "view-result",
    }),
    flowEdge("source.rendered-command.select-mode", "command.select-mode", {
      phase: "same-mode",
      provider: "browser-shell-harness",
    }),
    flowEdge("source.rendered-command.select-mode", "sink.render", {
      phase: "same-mode",
      terminal: "view-result",
    }),
  ]);
});

function createBrowserHostHarness({
  trace,
  durableStatePort,
}) {
  const reportedErrors = [];
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    reportedErrors,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-render", "sink.render", {
        ...trace.activeAttributes(),
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
  };
}

function createDurableStorageHarness({
  trace,
  durableState,
  readError = null,
  writeError = null,
}) {
  return {
    port: {
      async readDurableState() {
        trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-startup", "port.durable-state.read", {
          provider: "browser-shell-harness",
        }));
        if (readError) {
          trace.edge(flowEdge("port.durable-state.read", "sink.host-error", {
            terminal: "host-error",
          }));
          throw readError;
        }
        trace.edge(flowEdge("port.durable-state.read", "sink.startup-durable-state", {
          terminal: "port-result",
        }));
        trace.edge(flowEdge("port.durable-state.read", "callback.startup-durable-state", {
          provider: "browser-shell-harness",
        }));
        trace.edge(flowEdge("callback.startup-durable-state", "command.hydrate", {
          provider: "browser-shell-harness",
        }));
        return durableState;
      },
      async writeDurableState() {
        trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
          ...trace.activeAttributes(),
          provider: "browser-shell-effect-handler",
        }));
        if (writeError) {
          trace.edge(flowEdge("port.durable-state.write", "sink.host-error", {
            ...trace.activeAttributes(),
            terminal: "host-error",
          }));
          throw writeError;
        }
      },
    },
  };
}

async function startBrowserShell({ trace, host }) {
  return trace.withSource("source.bootstrap-browser-extension", () => (
    bootstrapBrowserExtension(host)
  ));
}

async function dispatchRenderedCommand({
  trace,
  dispatchCommand,
  command,
}) {
  const phase = command.mode === "trace" && trace.edges.some((edge) => edge.from === "source.rendered-command.select-mode")
    ? "same-mode"
    : "change-mode";
  const source = `source.rendered-command.${command.kind}`;
  trace.edge(flowEdge(source, `command.${command.kind}`, {
    phase,
    provider: "browser-shell-harness",
  }));
  await trace.withAttributes({ phase }, () => (
    trace.withSource(source, () => dispatchCommand(command))
  ));
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
