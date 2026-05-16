import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: the concrete persistence adapter may move
// closer to extension-specific code. The no-regret boundary is that persistence
// remains effect-driven; bootstrap wires the handler but does not decide what
// state is durable.
test("browser shell persists durable-state effects through the storage port", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell persists durable-state effects through the storage port",
  });
  const durableState = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
  const storage = createDurableStorageHarness({
    trace,
    durableState,
  });
  const host = createBrowserHostHarness({
    trace,
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  });

  assert.deepEqual(storage.writes, [{
    session: {
      ...durableState.session,
      mode: "trace",
    },
  }]);
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
      provider: "browser-shell-harness",
    }),
    flowEdge("effect.persist-durable-state", "port.durable-state.write", {
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.durable-state.write", "sink.durable-state.write", {
      terminal: "durable-write",
    }),
    flowEdge("source.rendered-command.select-mode", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

async function startBrowserShell({ trace, host }) {
  return trace.withSource("source.bootstrap-browser-extension", () => (
    bootstrapBrowserExtension(host)
  ));
}

async function dispatchRenderedCommand({ trace, dispatchCommand, command }) {
  const source = `source.rendered-command.${command.kind}`;
  trace.edge(flowEdge(source, `command.${command.kind}`, {
    provider: "browser-shell-harness",
  }));
  await trace.withSource(source, () => dispatchCommand(command));
}

function createBrowserHostHarness({
  trace,
  pageContext,
  durableStatePort,
}) {
  return {
    pageContext,
    durableStatePort,
    latestRender: null,
    mountOwnedRoot(_ownerId, root) {
      return root;
    },
    renderApplicationView(render) {
      trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-render", "sink.render", {
        terminal: "view-result",
      }));
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createDurableStorageHarness({ trace, durableState }) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-startup", "port.durable-state.read", {
          provider: "browser-shell-harness",
        }));
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
