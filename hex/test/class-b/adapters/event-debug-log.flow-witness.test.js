import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createEventDebugLogger,
  createEventDebugProbe,
} from "../../../adapters/ui/event-debug-log.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: live browser diagnosis is an adapter concern. The stable behavior is
// opt-in console evidence: production sessions stay quiet unless the browser
// explicitly enables event debugging.
test("event debug logger is opt-in and silent by default", () => {
  const trace = createTrace("event debug logger is opt-in and silent by default");
  const consoleLines = [];
  const ownerWindow = fakeWindow({
    localStorageValue: null,
  });
  const logger = createEventDebugLogger({
    ownerWindow,
    consoleObject: {
      info(line) {
        consoleLines.push(line);
      },
    },
  });

  trace.withSource("source.event-debug.log-call", () => {
    logger.log("probe.shadowRoot", "pointerdown", {
      clientX: 10,
    });
    trace.edge(flowEdge("source.event-debug.log-call", "inert.debug-disabled", {
      terminal: "diagnostic-policy",
    }));
  });

  assert.equal(logger.enabled, false);
  assert.deepEqual(consoleLines, []);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__, undefined);
  assert.deepEqual(trace.edges, [
    flowEdge("source.event-debug.log-call", "inert.debug-disabled", {
      terminal: "diagnostic-policy",
    }),
  ]);
});

// Class-b: exact console formatting may change, but enabled diagnostics must
// retain strict machine-readable records in both the console line and the
// in-window buffers we can inspect from DevTools.
test("event debug logger writes console and raw window records when enabled", () => {
  const trace = createTrace("event debug logger writes console and raw window records when enabled");
  const consoleLines = [];
  const ownerWindow = fakeWindow({
    localStorageValue: "1",
  });
  const logger = createEventDebugLogger({
    ownerWindow,
    consoleObject: {
      info(line) {
        consoleLines.push(line);
      },
    },
  });

  trace.withSource("source.event-debug.log-call", () => {
    logger.log("probe.shadowRoot", "pointerdown", {
      clientX: 10.12345,
    });
    trace.edge(flowEdge("source.event-debug.log-call", "sink.console-event-debug", {
      terminal: "diagnostic-artifact",
    }));
    trace.edge(flowEdge("source.event-debug.log-call", "sink.window-event-debug-buffer", {
      terminal: "diagnostic-artifact",
    }));
  });

  assert.equal(logger.enabled, true);
  assert.equal(consoleLines.length, 1);
  assert.match(consoleLines[0], /^\[id-overlay-event\] \{/u);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__.length, 1);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_RAW_LOGS__.length, 1);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].clientX, 10.123);
  assert.deepEqual(trace.edges, [
    flowEdge("source.event-debug.log-call", "sink.console-event-debug", {
      terminal: "diagnostic-artifact",
    }),
    flowEdge("source.event-debug.log-call", "sink.window-event-debug-buffer", {
      terminal: "diagnostic-artifact",
    }),
  ]);
});

// Class-b: high-frequency event diagnosis must not flood the console. Raw
// records remain complete for later inspection, while console output counts
// similar high-churn records into a summary instead of printing every target in
// the browser propagation path.
test("event debug logger counts similar high-churn events without dropping raw records", () => {
  const trace = createTrace("event debug logger counts similar high-churn events without dropping raw records");
  const consoleLines = [];
  const timers = [];
  const ownerWindow = fakeWindow({
    localStorageValue: "1",
    setTimeout(callback, delayMs) {
      const timer = {
        callback,
        delayMs,
        canceled: false,
      };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.canceled = true;
    },
  });
  const logger = createEventDebugLogger({
    ownerWindow,
    consoleObject: {
      info(line) {
        consoleLines.push(line);
      },
    },
  });

  trace.withSource("source.pointermove-burst", () => {
    logger.log("probe.shadowRoot", "pointermove", {
      clientX: 10,
    });
    logger.log("probe.document", "pointermove", {
      clientX: 11,
    });
    logger.log("probe.window", "pointermove", {
      clientX: 12,
    });
    trace.edge(flowEdge("source.pointermove-burst", "sink.window-event-debug-buffer", {
      phase: "raw-complete",
      terminal: "diagnostic-artifact",
    }));
    trace.edge(flowEdge("source.pointermove-burst", "callback.debug-debounce-timer", {
      phase: "summary-scheduled",
      surface: "browser-event-loop",
      provider: "browser-event-loop",
    }));
  });

  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_RAW_LOGS__.length, 3);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__, undefined);
  assert.equal(timers.filter((timer) => !timer.canceled).length, 2);

  trace.withSource("callback.debug-debounce-timer", () => {
    timers.find((timer) => !timer.canceled && timer.delayMs === 220).callback();
    trace.edge(flowEdge("callback.debug-debounce-timer", "sink.console-event-debug", {
      phase: "debounced-summary",
      terminal: "diagnostic-artifact",
    }));
  });

  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__.length, 1);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].event, "summary");
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].group, "input:pointermove");
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].totalCount, 3);
  assert.deepEqual(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].countsByScope, {
    "probe.document": 1,
    "probe.shadowRoot": 1,
    "probe.window": 1,
  });
  assert.deepEqual(trace.edges, [
    flowEdge("source.pointermove-burst", "sink.window-event-debug-buffer", {
      phase: "raw-complete",
      terminal: "diagnostic-artifact",
    }),
    flowEdge("source.pointermove-burst", "callback.debug-debounce-timer", {
      phase: "summary-scheduled",
      surface: "browser-event-loop",
      provider: "browser-event-loop",
    }),
    flowEdge("callback.debug-debounce-timer", "sink.console-event-debug", {
      phase: "debounced-summary",
      terminal: "diagnostic-artifact",
    }),
  ]);
});

// Class-b: adapter lifecycle diagnostics are useful only as churn evidence.
// Rebinding the rendered overlay during page observation must be counted as a
// quiet trailing summary, not printed as one line per render turn.
test("event debug logger summarizes repetitive overlay lifecycle churn", () => {
  const trace = createTrace("event debug logger summarizes repetitive overlay lifecycle churn");
  const consoleLines = [];
  const timers = [];
  const ownerWindow = fakeWindow({
    localStorageValue: "1",
    setTimeout(callback, delayMs) {
      const timer = {
        callback,
        delayMs,
        canceled: false,
      };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.canceled = true;
    },
  });
  const logger = createEventDebugLogger({
    ownerWindow,
    consoleObject: {
      info(line) {
        consoleLines.push(line);
      },
    },
  });

  trace.withSource("source.overlay-render-churn", () => {
    logger.log("overlay", "bind-input", {
      target: "overlay-surface",
    });
    logger.log("overlay", "destroy", {
      activeSequence: false,
    });
    logger.log("overlay", "bind-input", {
      target: "overlay-surface",
    });
    logger.log("overlay", "destroy", {
      activeSequence: false,
    });
    trace.edge(flowEdge("source.overlay-render-churn", "sink.window-event-debug-buffer", {
      phase: "raw-complete",
      terminal: "diagnostic-artifact",
    }));
    trace.edge(flowEdge("source.overlay-render-churn", "callback.debug-debounce-timer", {
      phase: "summary-scheduled",
      surface: "browser-event-loop",
      provider: "browser-event-loop",
    }));
  });

  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_RAW_LOGS__.length, 4);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__, undefined);
  assert.equal(timers.filter((timer) => !timer.canceled).length, 2);

  trace.withSource("callback.debug-debounce-timer", () => {
    timers.find((timer) => !timer.canceled && timer.delayMs === 600).callback();
    trace.edge(flowEdge("callback.debug-debounce-timer", "sink.console-event-debug", {
      phase: "debounced-summary",
      terminal: "diagnostic-artifact",
    }));
  });

  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__.length, 1);
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].event, "summary");
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].group, "overlay:lifecycle");
  assert.equal(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].totalCount, 4);
  assert.deepEqual(ownerWindow.__ID_OVERLAY_EVENT_DEBUG_LOGS__[0].countsByEvent, {
    "bind-input": 2,
    destroy: 2,
  });
  assert.deepEqual(trace.edges, [
    flowEdge("source.overlay-render-churn", "sink.window-event-debug-buffer", {
      phase: "raw-complete",
      terminal: "diagnostic-artifact",
    }),
    flowEdge("source.overlay-render-churn", "callback.debug-debounce-timer", {
      phase: "summary-scheduled",
      surface: "browser-event-loop",
      provider: "browser-event-loop",
    }),
    flowEdge("callback.debug-debounce-timer", "sink.console-event-debug", {
      phase: "debounced-summary",
      terminal: "diagnostic-artifact",
    }),
  ]);
});

// Class-b: the live probe is evidence-only. It must observe browser events at
// the host/shadow boundary without preventing default behavior or stopping
// propagation.
test("event debug probe observes shadow events without owning them", () => {
  const trace = createTrace("event debug probe observes shadow events without owning them");
  const { window } = new JSDOM("<!doctype html><body></body>", {
    url: "https://www.openstreetmap.org/edit",
  });
  const hostElement = window.document.createElement("div");
  const shadowRoot = hostElement.attachShadow({
    mode: "open",
  });
  const overlay = window.document.createElement("div");
  overlay.dataset.region = "overlay";
  const panel = window.document.createElement("div");
  panel.dataset.region = "panel";
  const button = window.document.createElement("button");
  button.dataset.control = "trace";
  panel.append(button);
  shadowRoot.append(overlay, panel);
  window.document.body.append(hostElement);
  window.localStorage.setItem("idOverlay.debugEvents", "1");
  const logger = createEventDebugLogger({
    ownerWindow: window,
    consoleObject: {
      info() {},
    },
  });
  const probe = createEventDebugProbe({
    ownerWindow: window,
    document: window.document,
    root: {
      hostElement,
      shadowRoot,
      overlay,
      panel,
    },
    logger,
  });

  const event = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  trace.withSource("source.browser-click", () => {
    button.dispatchEvent(event);
    trace.edge(flowEdge("source.browser-click", "sink.window-event-debug-buffer", {
      terminal: "diagnostic-artifact",
    }));
    trace.edge(flowEdge("source.browser-click", "sink.browser-event-unowned", {
      terminal: "browser-event-continues",
    }));
  });

  assert.equal(event.defaultPrevented, false);
  assert.ok(window.__ID_OVERLAY_EVENT_DEBUG_RAW_LOGS__.some((record) => record.scope === "probe.shadowRoot"));
  assert.ok(window.__ID_OVERLAY_EVENT_DEBUG_RAW_LOGS__.some((record) => (
    record.scope === "probe.shadowRoot"
      && record.path.includes("button[data-control=trace]")
  )));

  probe.destroy();
  assert.deepEqual(trace.edges, [
    flowEdge("source.browser-click", "sink.window-event-debug-buffer", {
      terminal: "diagnostic-artifact",
    }),
    flowEdge("source.browser-click", "sink.browser-event-unowned", {
      terminal: "browser-event-continues",
    }),
  ]);
});

function createTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function fakeWindow({
  localStorageValue,
  setTimeout = () => null,
  clearTimeout,
} = {}) {
  return {
    performance: {
      now() {
        return 1234.5678;
      },
    },
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) {
        assert.equal(key, "idOverlay.debugEvents");
        return localStorageValue;
      },
    },
  };
}
