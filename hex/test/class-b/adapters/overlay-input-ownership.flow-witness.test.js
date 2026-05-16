import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayInputHost,
} from "../../../adapters/ui/overlay-input-host.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: global listener retargeting is browser
// adapter lifecycle, not product law. The stable boundary is that an active
// overlay pointer sequence follows the current mount window and stops listening
// to the previous one.
test("overlay input host retargets global pointer listeners to the active mount window", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay input host retargets global pointer listeners to the active mount window",
  });
  const first = new JSDOM("<!doctype html><body><div id='map-a'></div></body>");
  const second = new JSDOM("<!doctype html><body><div id='map-b'></div></body>");
  let mountElement = first.window.document.getElementById("map-a");
  const moves = [];
  const host = createOverlayInputHost({
    getMountElement: () => mountElement,
    globalPointerHandlers: {
      handleGlobalPointerMove(event) {
        trace.edge(flowEdge(trace.activeSource(), "callback.overlay-input.global-pointer-move", {
          ...trace.activeAttributes(),
          provider: "overlay-input-host",
        }));
        trace.edge(flowEdge("callback.overlay-input.global-pointer-move", "sink.overlay-input.global-pointer-move", {
          ...trace.activeAttributes(),
          terminal: "port-result",
        }));
        moves.push(event.clientX);
      },
    },
    fallbackWindow: first.window,
  });

  host.syncGlobalPointerListeners(true);
  trace.withAttributes({ phase: "initial-window" }, () => {
    trace.withSource("source.overlay-input.initial-window.pointermove", () => {
      first.window.dispatchEvent(pointerEvent(first.window, "pointermove", {
        x: 1,
        y: 10,
      }));
    });
  });
  mountElement = second.window.document.getElementById("map-b");
  host.syncGlobalPointerListeners(true);
  trace.withAttributes({ phase: "previous-window" }, () => {
    trace.withSource("source.overlay-input.previous-window.pointermove", () => {
      first.window.dispatchEvent(pointerEvent(first.window, "pointermove", {
        x: 2,
        y: 20,
      }));
      trace.edge(flowEdge("source.overlay-input.previous-window.pointermove", "inert.stale-overlay-input-window", {
        phase: "previous-window",
        terminal: "intentionally-inert",
      }));
    });
  });
  trace.withAttributes({ phase: "active-window" }, () => {
    trace.withSource("source.overlay-input.active-window.pointermove", () => {
      second.window.dispatchEvent(pointerEvent(second.window, "pointermove", {
        x: 3,
        y: 30,
      }));
    });
  });

  assert.deepEqual(moves, [1, 3]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.overlay-input.initial-window.pointermove", "callback.overlay-input.global-pointer-move", {
      phase: "initial-window",
      provider: "overlay-input-host",
    }),
    flowEdge("callback.overlay-input.global-pointer-move", "sink.overlay-input.global-pointer-move", {
      phase: "initial-window",
      terminal: "port-result",
    }),
    flowEdge("source.overlay-input.previous-window.pointermove", "inert.stale-overlay-input-window", {
      phase: "previous-window",
      terminal: "intentionally-inert",
    }),
    flowEdge("source.overlay-input.active-window.pointermove", "callback.overlay-input.global-pointer-move", {
      phase: "active-window",
      provider: "overlay-input-host",
    }),
    flowEdge("callback.overlay-input.global-pointer-move", "sink.overlay-input.global-pointer-move", {
      phase: "active-window",
      terminal: "port-result",
    }),
  ]);
});

// Class-b, deliberately not class-a: unmounting the overlay must remove global
// listeners so late browser events cannot continue a stale pointer sequence.
test("overlay input host destroy removes pending global pointer listeners", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay input host destroy removes pending global pointer listeners",
  });
  const { window } = new JSDOM("<!doctype html><body><div id='map'></div></body>");
  const moves = [];
  const host = createOverlayInputHost({
    getMountElement: () => window.document.getElementById("map"),
    globalPointerHandlers: {
      handleGlobalPointerMove(event) {
        trace.edge(flowEdge(trace.activeSource(), "callback.overlay-input.global-pointer-move", {
          ...trace.activeAttributes(),
          provider: "overlay-input-host",
        }));
        trace.edge(flowEdge("callback.overlay-input.global-pointer-move", "sink.overlay-input.global-pointer-move", {
          ...trace.activeAttributes(),
          terminal: "port-result",
        }));
        moves.push(event.clientX);
      },
    },
    fallbackWindow: window,
  });

  host.syncGlobalPointerListeners(true);
  host.destroy();
  trace.withSource("source.overlay-input.destroyed-window.pointermove", () => {
    window.dispatchEvent(pointerEvent(window, "pointermove", {
      x: 1,
      y: 10,
    }));
    trace.edge(flowEdge("source.overlay-input.destroyed-window.pointermove", "inert.destroyed-overlay-input-host", {
      terminal: "intentionally-inert",
    }));
  });

  assert.deepEqual(moves, []);
  assert.deepEqual(trace.edges, [
    flowEdge("source.overlay-input.destroyed-window.pointermove", "inert.destroyed-overlay-input-host", {
      terminal: "intentionally-inert",
    }),
  ]);
});

function pointerEvent(window, type, { x, y }) {
  return new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
}
