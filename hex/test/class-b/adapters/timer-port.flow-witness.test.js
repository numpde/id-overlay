import test from "node:test";
import assert from "node:assert/strict";

import {
  createTimerPortAdapter,
} from "../../../adapters/web/timer-port.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: this is a concrete browser-clock adapter.
// The stable boundary is that the adapter never invents timer-fired product
// facts; it only waits and dispatches the exact application command it was
// given by the app/runtime seam.
test("timer port dispatches the scheduled application command unchanged", () => {
  const trace = createTimerTrace("timer port dispatches the scheduled application command unchanged");
  const scheduled = [];
  const dispatched = [];
  const timerPort = createTimerPortAdapter({
    setTimer(delayMs, callback) {
      scheduled.push({
        delayMs,
        callback,
      });
      return {
        runtimeTimerHandle: scheduled.length,
      };
    },
    clearTimer() {},
  });

  scheduleStatusNotice({
    trace,
    timerPort,
    requestId: 7,
  });

  assert.equal(scheduled[0].delayMs, 2500);
  trace.withSource("source.timer.status-notice.fire", () => {
    trace.edge(flowEdge("source.timer.status-notice.fire", "callback.timer.status-notice", {
      provider: "timer-port-adapter",
    }));
    trace.withSource("callback.timer.status-notice", () => {
      scheduled[0].callback();
    });
  });
  assert.deepEqual(dispatched, [{
    kind: "clear-status-notice",
    requestId: 7,
  }]);
  assert.deepEqual(trace.edges, [
    ...scheduleEdges(),
    flowEdge("source.timer.status-notice.fire", "callback.timer.status-notice", {
      provider: "timer-port-adapter",
    }),
    flowEdge("callback.timer.status-notice", "command.clear-status-notice", {
      provider: "timer-port-adapter",
    }),
  ]);

  function scheduleStatusNotice({
    trace: scheduleTrace,
    timerPort: port,
    requestId,
  }) {
    scheduleTrace.withSource("source.timer.status-notice.schedule", () => {
      scheduleTrace.edge(flowEdge("source.timer.status-notice.schedule", "port.timer.schedule-application-command", {
        provider: "timer-port-adapter",
      }));
      port.scheduleApplicationCommand({
        scheduleId: "status-notice",
        delayMs: 2500,
        command: {
          kind: "clear-status-notice",
          requestId,
        },
        dispatchApplicationCommand(command) {
          scheduleTrace.edge(flowEdge(scheduleTrace.activeSource() ?? "callback.timer.status-notice", `command.${command.kind}`, {
            provider: "timer-port-adapter",
          }));
          dispatched.push(command);
        },
      });
      scheduleTrace.edge(flowEdge("port.timer.schedule-application-command", "callback.timer.status-notice", {
        provider: "timer-port-adapter",
      }));
    });
  }
});

// Class-b: schedule slots are runtime ownership, not product state. Replacing
// the previous clock for the same slot prevents stale callbacks from replaying
// old app commands while leaving request-id staleness checks inside the app.
test("timer port replaces older clock for the same schedule slot", () => {
  const trace = createTimerTrace("timer port replaces older clock for the same schedule slot");
  const scheduled = [];
  const cleared = [];
  const dispatched = [];
  const timerPort = createTimerPortAdapter({
    setTimer(delayMs, callback) {
      const handle = {
        runtimeTimerHandle: scheduled.length + 1,
      };
      scheduled.push({
        delayMs,
        callback,
        handle,
      });
      return handle;
    },
    clearTimer(handle) {
      cleared.push(handle);
    },
  });

  scheduleStatusNotice({
    phase: "first-schedule",
    requestId: 1,
  });
  scheduleStatusNotice({
    phase: "second-schedule",
    requestId: 2,
  });

  assert.deepEqual(cleared, [scheduled[0].handle]);

  fireStatusNotice({
    phase: "stale-fire",
    callback: scheduled[0].callback,
    active: false,
  });
  fireStatusNotice({
    phase: "active-fire",
    callback: scheduled[1].callback,
    active: true,
  });

  assert.deepEqual(dispatched, [{
    kind: "clear-status-notice",
    requestId: 2,
  }]);
  assert.deepEqual(trace.edges, [
    ...scheduleEdges({ phase: "first-schedule" }),
    ...scheduleEdges({ phase: "second-schedule" }),
    flowEdge("source.timer.status-notice.fire", "callback.timer.status-notice", {
      phase: "stale-fire",
      provider: "timer-port-adapter",
    }),
    flowEdge("callback.timer.status-notice", "inert.replaced-timer-callback", {
      phase: "stale-fire",
      terminal: "intentionally-inert",
    }),
    flowEdge("source.timer.status-notice.fire", "callback.timer.status-notice", {
      phase: "active-fire",
      provider: "timer-port-adapter",
    }),
    flowEdge("callback.timer.status-notice", "command.clear-status-notice", {
      phase: "active-fire",
      provider: "timer-port-adapter",
    }),
  ]);

  function scheduleStatusNotice({ phase, requestId }) {
    trace.withSource("source.timer.status-notice.schedule", () => {
      trace.edge(flowEdge("source.timer.status-notice.schedule", "port.timer.schedule-application-command", {
        phase,
        provider: "timer-port-adapter",
      }));
      timerPort.scheduleApplicationCommand({
        scheduleId: "status-notice",
        delayMs: 2500,
        command: {
          kind: "clear-status-notice",
          requestId,
        },
        dispatchApplicationCommand(command) {
          trace.edge(flowEdge(trace.activeSource() ?? "callback.timer.status-notice", `command.${command.kind}`, {
            phase: trace.activeAttributes().phase,
            provider: "timer-port-adapter",
          }));
          dispatched.push(command);
        },
      });
      trace.edge(flowEdge("port.timer.schedule-application-command", "callback.timer.status-notice", {
        phase,
        provider: "timer-port-adapter",
      }));
    });
  }

  function fireStatusNotice({ phase, callback, active }) {
    trace.withAttributes({ phase }, () => {
      trace.withSource("source.timer.status-notice.fire", () => {
        trace.edge(flowEdge("source.timer.status-notice.fire", "callback.timer.status-notice", {
          phase,
          provider: "timer-port-adapter",
        }));
        trace.withSource("callback.timer.status-notice", () => {
          callback();
        });
        if (!active) {
          trace.edge(flowEdge("callback.timer.status-notice", "inert.replaced-timer-callback", {
            phase,
            terminal: "intentionally-inert",
          }));
        }
      });
    });
  }
});

function createTimerTrace(test) {
  return createFlowTrace({
    file: import.meta.url,
    test,
  });
}

function scheduleEdges(attributes = {}) {
  return [
    flowEdge("source.timer.status-notice.schedule", "port.timer.schedule-application-command", {
      ...attributes,
      provider: "timer-port-adapter",
    }),
    flowEdge("port.timer.schedule-application-command", "callback.timer.status-notice", {
      ...attributes,
      provider: "timer-port-adapter",
    }),
  ];
}
