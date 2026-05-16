import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: bootstrap may wire the app's scheduled-command effect to a browser
// clock, but it must not inspect `notice`, `panelIntent`, or any other product
// field to decide what to clear. The effect already contains the exact command
// to dispatch later.
test("browser shell clears status by dispatching the scheduled app command", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell clears status by dispatching the scheduled app command",
  });
  const timers = createApplicationCommandTimerHarness({ trace });
  const host = createBrowserHostHarness({
    trace,
    timerPort: timers.port,
  });

  await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "report-reference-image-input-outcome",
      requestId: 1,
      outcome: {
        kind: "empty",
      },
    },
  });

  assert.deepEqual(timers.schedules, [{
    scheduleId: "status-notice",
    delayMs: 2500,
    command: {
      kind: "clear-status-notice",
      requestId: 1,
    },
  }]);

  await timers.fire("status-notice");

  assert.equal(host.latestRender.view.status, "Paste a screenshot to begin.");
  assert.deepEqual(timerEdges(trace), [
    flowEdge("effect.schedule-application-command", "port.timer.schedule-application-command", {
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.timer.schedule-application-command", "callback.timer.status-notice", {
      provider: "timer-harness",
    }),
    flowEdge("source.timer.status-notice.fire", "callback.timer.status-notice", {
      provider: "timer-harness",
    }),
    flowEdge("callback.timer.status-notice", "command.clear-status-notice", {
      provider: "timer-harness",
    }),
    flowEdge("callback.timer.status-notice", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

// Class-b: confirmation expiry is the same shell protocol as status expiry.
// The shell schedules and fires the embedded command; the application owns
// intent matching and stale rejection.
test("browser shell clears panel intent by dispatching the scheduled app command", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell clears panel intent by dispatching the scheduled app command",
  });
  const timers = createApplicationCommandTimerHarness({ trace });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: createDurableStorageHarness({
      trace,
      durableState: durableImageState(),
    }).port,
    timerPort: timers.port,
  });

  await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });

  assert.deepEqual(timers.schedules, [{
    scheduleId: "panel-intent",
    delayMs: 2500,
    command: {
      kind: "clear-panel-intent",
      requestId: 1,
      intentKind: "confirm-clear-reference-image",
    },
  }]);
  assert.match(host.latestRender.view.primaryAction.label, /clear image\?/i);

  await timers.fire("panel-intent");

  assert.equal(host.latestRender.view.primaryAction.label, "Clear image");
  assert.deepEqual(timerEdges(trace), [
    flowEdge("effect.schedule-application-command", "port.timer.schedule-application-command", {
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.timer.schedule-application-command", "callback.timer.panel-intent", {
      provider: "timer-harness",
    }),
    flowEdge("source.timer.panel-intent.fire", "callback.timer.panel-intent", {
      provider: "timer-harness",
    }),
    flowEdge("callback.timer.panel-intent", "command.clear-panel-intent", {
      provider: "timer-harness",
    }),
    flowEdge("callback.timer.panel-intent", "sink.render", {
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

function timerEdges(trace) {
  return trace.edges.filter((edge) => (
    edge.from.startsWith("effect.schedule-application-command")
      || edge.from.startsWith("port.timer.")
      || edge.from.startsWith("source.timer.")
      || edge.from.startsWith("callback.timer.")
  ));
}

function createBrowserHostHarness({
  trace,
  durableStatePort = createDurableStorageHarness({
    trace,
    durableState: null,
  }).port,
  timerPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    timerPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
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

function createApplicationCommandTimerHarness({ trace }) {
  const scheduleEntries = [];
  return {
    get schedules() {
      return scheduleEntries.map(({ scheduleId, delayMs, command }) => ({
        scheduleId,
        delayMs,
        command,
      }));
    },
    async fire(scheduleId) {
      const scheduled = scheduleEntries.find((schedule) => schedule.scheduleId === scheduleId);
      if (!scheduled) {
        throw new TypeError(`missing schedule: ${scheduleId}`);
      }
      const source = `source.timer.${scheduleId}.fire`;
      const callback = `callback.timer.${scheduleId}`;
      await trace.withSource(source, async () => {
        trace.edge(flowEdge(source, callback, {
          provider: "timer-harness",
        }));
        await trace.withSource(callback, async () => {
          trace.edge(flowEdge(callback, `command.${scheduled.command.kind}`, {
            provider: "timer-harness",
          }));
          await scheduled.dispatchApplicationCommand(scheduled.command);
        });
      });
    },
    port: {
      scheduleApplicationCommand({
        scheduleId,
        delayMs,
        command,
        dispatchApplicationCommand,
      }) {
        trace.edge(flowEdge("effect.schedule-application-command", "port.timer.schedule-application-command", {
          provider: "browser-shell-effect-handler",
        }));
        trace.edge(flowEdge("port.timer.schedule-application-command", `callback.timer.${scheduleId}`, {
          provider: "timer-harness",
        }));
        scheduleEntries.push({
          scheduleId,
          delayMs,
          command,
          dispatchApplicationCommand,
        });
      },
    },
  };
}

function createDurableStorageHarness({ trace, durableState }) {
  return {
    port: {
      async readDurableState() {
        trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-startup", "port.durable-state.read", {
          provider: "browser-shell-harness",
        }));
        trace.edge(flowEdge("port.durable-state.read", "sink.startup-durable-state", {
          terminal: "port-result",
        }));
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
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
