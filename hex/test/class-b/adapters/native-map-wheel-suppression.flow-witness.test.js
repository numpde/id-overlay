import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createNativeMapWheelSuppression,
} from "../../../adapters/page-osm-id/native-map-wheel-suppression.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: native-map wheel suppression is a page-adapter resource, not a
// global patch. It may suppress wheel noise while a native map pan is active,
// but destroying the adapter must release page listeners and stop influencing
// later browser input.
test("native map wheel suppression releases page listeners on destroy", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "native map wheel suppression releases page listeners on destroy",
  });
  const { window } = new JSDOM("<!doctype html><body><div id='map'></div></body>");
  const map = window.document.getElementById("map");
  const suppression = createNativeMapWheelSuppression({
    document: window.document,
    ownerWindow: window,
  });

  activateDirectPan({ trace, window, map, phase: "before-destroy" });
  const suppressedWheel = dispatchWheel({ trace, window, map, phase: "before-destroy" });
  suppression.destroy();
  suppression.destroy();
  activateDirectPan({ trace, window, map, phase: "after-destroy" });
  const unsuppressedWheel = dispatchWheel({ trace, window, map, phase: "after-destroy" });

  assert.equal(suppressedWheel.defaultPrevented, true);
  assert.equal(unsuppressedWheel.defaultPrevented, false);
  assert.deepEqual(trace.edges, [
    flowEdge("source.native-map.drag.before-destroy", "sink.active-native-map-pan", {
      phase: "before-destroy",
      terminal: "runtime-state",
    }),
    flowEdge("source.native-map.wheel.before-destroy", "inert.active-native-map-pan-wheel", {
      phase: "before-destroy",
      terminal: "intentionally-inert",
    }),
    flowEdge("source.native-map.drag.after-destroy", "sink.browser-native-wheel", {
      phase: "after-destroy",
      terminal: "pass-through",
    }),
    flowEdge("source.native-map.wheel.after-destroy", "sink.browser-native-wheel", {
      phase: "after-destroy",
      terminal: "pass-through",
    }),
  ]);
});

function activateDirectPan({ trace, window, map, phase }) {
  trace.withSource(`source.native-map.drag.${phase}`, () => {
    dispatchPointer(window, map, "pointerdown", {
      clientX: 100,
      clientY: 100,
    });
    dispatchPointer(window, window, "pointermove", {
      clientX: 120,
      clientY: 100,
    });
  });
  trace.edge(flowEdge(`source.native-map.drag.${phase}`, phase === "before-destroy"
    ? "sink.active-native-map-pan"
    : "sink.browser-native-wheel", {
    phase,
    terminal: phase === "before-destroy" ? "runtime-state" : "pass-through",
  }));
}

function dispatchPointer(window, target, type, options) {
  target.dispatchEvent(new window.MouseEvent(type, {
    button: 0,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  }));
}

function dispatchWheel({ trace, window, map, phase }) {
  const event = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 120,
    clientY: 100,
    deltaY: -100,
  });
  trace.withSource(`source.native-map.wheel.${phase}`, () => {
    map.dispatchEvent(event);
  });
  trace.edge(flowEdge(`source.native-map.wheel.${phase}`, event.defaultPrevented
    ? "inert.active-native-map-pan-wheel"
    : "sink.browser-native-wheel", {
    phase,
    terminal: event.defaultPrevented ? "intentionally-inert" : "pass-through",
  }));
  return event;
}
