import test from "node:test";
import assert from "node:assert/strict";

import {
  createHotPathWatchdog,
} from "../../../bootstrap/hot-path-watchdog.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

test("hot path watchdog reports preview-phase shell sinks once per sink", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "hot path watchdog reports preview-phase shell sinks once per sink",
  });
  const debugEvents = [];
  const warnings = [];
  const watchdog = createHotPathWatchdog({
    eventDebugLogger: {
      log(scope, event, payload) {
        debugEvents.push({
          scope,
          event,
          payload,
        });
      },
    },
    consoleObject: {
      warn(message, payload) {
        warnings.push({
          message,
          payload,
        });
      },
    },
  });

  watchdog.begin({
    interaction: "opacity-slider",
    source: "panel.opacity.input",
  });
  trace.edge(flowEdge("source.panel.opacity.input", "sink.hot-path-preview", {
    terminal: "local-preview",
  }));

  watchdog.noteSink({
    sink: "durable-state-write",
    detail: {
      effect: "persist-durable-state",
    },
  });
  watchdog.noteSink({
    sink: "durable-state-write",
    detail: {
      effect: "persist-durable-state",
    },
  });
  watchdog.noteSink({
    sink: "panel-chrome-write",
  });
  trace.edge(flowEdge("source.panel.opacity.input", "sink.hot-path-diagnostic", {
    phase: "durable-state-write",
    terminal: "diagnostic",
  }));
  trace.edge(flowEdge("source.panel.opacity.input", "sink.hot-path-diagnostic", {
    phase: "panel-chrome-write",
    terminal: "diagnostic",
  }));

  assert.deepEqual(debugEvents, [
    {
      scope: "hot-path",
      event: "unexpected-sink",
      payload: {
        interaction: "opacity-slider",
        phase: "preview",
        source: "panel.opacity.input",
        sink: "durable-state-write",
        effect: "persist-durable-state",
      },
    },
    {
      scope: "hot-path",
      event: "unexpected-sink",
      payload: {
        interaction: "opacity-slider",
        phase: "preview",
        source: "panel.opacity.input",
        sink: "panel-chrome-write",
      },
    },
  ]);
  assert.deepEqual(warnings, [
    {
      message: "id-overlay: shell sink during preview interaction",
      payload: {
        interaction: "opacity-slider",
        phase: "preview",
        source: "panel.opacity.input",
        sink: "durable-state-write",
        effect: "persist-durable-state",
      },
    },
    {
      message: "id-overlay: shell sink during preview interaction",
      payload: {
        interaction: "opacity-slider",
        phase: "preview",
        source: "panel.opacity.input",
        sink: "panel-chrome-write",
      },
    },
  ]);
});

test("hot path watchdog does not report commit-phase or ended interaction sinks", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "hot path watchdog does not report commit-phase or ended interaction sinks",
  });
  const debugEvents = [];
  const watchdog = createHotPathWatchdog({
    eventDebugLogger: {
      log(scope, event, payload) {
        debugEvents.push({
          scope,
          event,
          payload,
        });
      },
    },
  });

  watchdog.begin({
    interaction: "panel-drag",
    source: "panel.header.drag",
  });
  watchdog.commit({
    interaction: "panel-drag",
  });
  watchdog.noteSink({
    sink: "panel-chrome-write",
  });
  watchdog.end({
    interaction: "panel-drag",
  });
  watchdog.noteSink({
    sink: "render",
  });
  trace.edge(flowEdge("source.panel.drag.commit", "sink.panel-chrome.position", {
    terminal: "allowed-commit",
  }));

  assert.deepEqual(debugEvents, []);
});
