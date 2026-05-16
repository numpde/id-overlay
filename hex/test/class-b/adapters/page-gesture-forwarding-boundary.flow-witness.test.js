import test from "node:test";
import assert from "node:assert/strict";

import {
  createGestureForwardingAdapter,
} from "../../../adapters/page-osm-id/gesture-forwarding-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: exact OSM/iD event transport is adapter
// mechanics. The stable boundary is that forwarding is transport, not mode
// policy: the shell decides when to forward, and the page adapter receives one
// explicit native-map gesture fact without reading product state.
test("gesture forwarding adapter transports explicit native-map gesture facts unchanged", async () => {
  const trace = createGestureTrace("gesture forwarding adapter transports explicit native-map gesture facts unchanged");
  const forwarded = [];
  const adapter = createGestureForwardingAdapter({
    async forwardGesture(gestureFact) {
      forwarded.push(gestureFact);
      return {
        kind: "forwarded-native-map-gesture",
      };
    },
    readApplicationState() {
      assert.fail("gesture forwarding must not inspect product state");
    },
  });
  const gestureFact = {
    kind: "native-map-wheel",
    screenPx: {
      x: 320,
      y: 240,
    },
    delta: {
      x: 0,
      y: -120,
      mode: "pixel",
    },
    modifiers: {
      alt: false,
      ctrl: false,
      meta: false,
      shift: false,
    },
  };

  const result = await trace.withSource("source.native-map-gesture.forward-request", async () => {
    trace.edge(flowEdge("source.native-map-gesture.forward-request", "port.forward-native-map-gesture", {
      provider: "gesture-forwarding-adapter",
    }));
    const forwardedResult = await adapter.forward(gestureFact);
    trace.edge(flowEdge("port.forward-native-map-gesture", "sink.native-map-gesture-forwarded", {
      terminal: "port-result",
    }));
    return forwardedResult;
  });

  assert.deepEqual(result, {
    kind: "forwarded-native-map-gesture",
  });
  assert.deepEqual(forwarded, [gestureFact]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.native-map-gesture.forward-request", "port.forward-native-map-gesture", {
      provider: "gesture-forwarding-adapter",
    }),
    flowEdge("port.forward-native-map-gesture", "sink.native-map-gesture-forwarded", {
      terminal: "port-result",
    }),
  ]);
});

// Class-b, deliberately not class-a: OSM/iD event construction is page-adapter
// mechanics. The stable boundary is that pan forwarding is a bounded session:
// the adapter selects the active map document at start and keeps that
// iframe-local coordinate context for move/up.
test("map pan forwarding keeps one active iframe-local gesture context", () => {
  const trace = createGestureTrace("map pan forwarding keeps one active iframe-local gesture context");
  const dispatched = [];
  const adapter = createGestureForwardingAdapter({
    readActiveMapGestureContext() {
      return {
        frameScreenPx: {
          x: 300,
          y: 40,
        },
        panTarget: "embedded-map-viewport",
        continuationTarget: "embedded-map-document",
      };
    },
    dispatchForwardedPointer(event) {
      trace.edge(flowEdge("port.forward-native-map-pointer", "sink.native-map-pointer-dispatch", {
        phase: event.phase,
        terminal: "port-result",
      }));
      dispatched.push(event);
    },
  });

  const pan = trace.withSource("source.native-map-pan.start", () => {
    trace.edge(flowEdge("source.native-map-pan.start", "port.forward-native-map-pointer", {
      phase: "start",
      provider: "gesture-forwarding-adapter",
    }));
    return adapter.beginMapPan({
      screenPx: {
        x: 800,
        y: 240,
      },
    });
  });
  trace.withSource("source.native-map-pan.move", () => {
    trace.edge(flowEdge("source.native-map-pan.move", "port.forward-native-map-pointer", {
      phase: "move",
      provider: "gesture-forwarding-adapter",
    }));
    pan.move({
      screenPx: {
        x: 820,
        y: 260,
      },
    });
  });
  trace.withSource("source.native-map-pan.end", () => {
    trace.edge(flowEdge("source.native-map-pan.end", "port.forward-native-map-pointer", {
      phase: "end",
      provider: "gesture-forwarding-adapter",
    }));
    pan.finish({
      screenPx: {
        x: 820,
        y: 260,
      },
    });
  });

  assert.deepEqual(dispatched, [
    {
      phase: "start",
      target: "embedded-map-viewport",
      clientPx: {
        x: 500,
        y: 200,
      },
      forwarded: true,
    },
    {
      phase: "move",
      target: "embedded-map-document",
      clientPx: {
        x: 520,
        y: 220,
      },
      forwarded: true,
    },
    {
      phase: "end",
      target: "embedded-map-document",
      clientPx: {
        x: 520,
        y: 220,
      },
      forwarded: true,
    },
  ]);
  assert.deepEqual(trace.edges, [
    ...pointerDispatchEdges("source.native-map-pan.start", "start"),
    ...pointerDispatchEdges("source.native-map-pan.move", "move"),
    ...pointerDispatchEdges("source.native-map-pan.end", "end"),
  ]);
});

// Class-b: forwarded map pan must target the map viewport even when the screen
// point is visually covered by extension-owned overlay DOM. Otherwise native
// map panning depends on overlay hit-testing accidents.
test("map pan forwarding skips extension-owned overlay hit testing", () => {
  const trace = createGestureTrace("map pan forwarding skips extension-owned overlay hit testing");
  const dispatched = [];
  const adapter = createGestureForwardingAdapter({
    readActiveMapGestureContext() {
      return {
        frameScreenPx: {
          x: 0,
          y: 0,
        },
        panTarget: "map-viewport",
        hitTestStack: ["overlay-image", "map-feature", "map-viewport"],
        extensionOwnedTargets: ["overlay-image"],
      };
    },
    dispatchForwardedPointer(event) {
      trace.edge(flowEdge("port.forward-native-map-pointer", "sink.native-map-pointer-dispatch", {
        terminal: "port-result",
      }));
      dispatched.push(event);
    },
  });

  const pan = trace.withSource("source.native-map-pan.start", () => {
    trace.edge(flowEdge("source.native-map-pan.start", "port.forward-native-map-pointer", {
      provider: "gesture-forwarding-adapter",
    }));
    return adapter.beginMapPan({
      screenPx: {
        x: 200,
        y: 180,
      },
    });
  });

  assert.notEqual(pan, null);
  assert.deepEqual(dispatched, [{
    phase: "start",
    target: "map-viewport",
    clientPx: {
      x: 200,
      y: 180,
    },
    forwarded: true,
  }]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.native-map-pan.start", "port.forward-native-map-pointer", {
      provider: "gesture-forwarding-adapter",
    }),
    flowEdge("port.forward-native-map-pointer", "sink.native-map-pointer-dispatch", {
      terminal: "port-result",
    }),
  ]);
});

// Class-b: map zoom forwarding is not a bubbling fallback. The adapter
// hit-tests below extension-owned overlay elements, translates the point into
// the active map document, and dispatches one flagged wheel event.
test("map zoom forwarding skips overlay elements and preserves wheel deltas", () => {
  const trace = createGestureTrace("map zoom forwarding skips overlay elements and preserves wheel deltas");
  const dispatched = [];
  const adapter = createGestureForwardingAdapter({
    readActiveMapGestureContext() {
      return {
        frameScreenPx: {
          x: 300,
          y: 40,
        },
        hitTestStack: ["overlay-image", "embedded-map-viewport"],
        extensionOwnedTargets: ["overlay-image"],
      };
    },
    dispatchForwardedWheel(event) {
      trace.edge(flowEdge("port.forward-native-map-wheel", "sink.native-map-wheel-dispatch", {
        terminal: "port-result",
      }));
      dispatched.push(event);
    },
  });

  const forwarded = trace.withSource("source.native-map-wheel.forward-request", () => {
    trace.edge(flowEdge("source.native-map-wheel.forward-request", "port.forward-native-map-wheel", {
      provider: "gesture-forwarding-adapter",
    }));
    return adapter.forwardMapZoom({
      screenPx: {
        x: 800,
        y: 240,
      },
      deltaY: -100,
    });
  });

  assert.equal(forwarded, true);
  assert.deepEqual(dispatched, [{
    target: "embedded-map-viewport",
    clientPx: {
      x: 500,
      y: 200,
    },
    deltaY: -100,
    forwarded: true,
  }]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.native-map-wheel.forward-request", "port.forward-native-map-wheel", {
      provider: "gesture-forwarding-adapter",
    }),
    flowEdge("port.forward-native-map-wheel", "sink.native-map-wheel-dispatch", {
      terminal: "port-result",
    }),
  ]);
});

// Class-b: failed native-map forwarding is an explicit inert page-boundary
// result. The adapter must not fabricate a target when no active map gesture
// context is available.
test("native-map gesture forwarding fails closed without an active map target", () => {
  const trace = createGestureTrace("native-map gesture forwarding fails closed without an active map target");
  const dispatched = [];
  const adapter = createGestureForwardingAdapter({
    readActiveMapGestureContext() {
      return {
        frameScreenPx: {
          x: 0,
          y: 0,
        },
        hitTestStack: ["overlay-image"],
        extensionOwnedTargets: ["overlay-image"],
      };
    },
    dispatchForwardedPointer(event) {
      dispatched.push(event);
    },
    dispatchForwardedWheel(event) {
      dispatched.push(event);
    },
  });

  const pan = trace.withSource("source.native-map-pan.start", () => {
    const result = adapter.beginMapPan({
      screenPx: {
        x: 200,
        y: 180,
      },
    });
    trace.edge(flowEdge("source.native-map-pan.start", "inert.no-native-map-target", {
      phase: "pan",
      terminal: "intentionally-inert",
    }));
    return result;
  });
  const zoom = trace.withSource("source.native-map-wheel.forward-request", () => {
    const result = adapter.forwardMapZoom({
      screenPx: {
        x: 200,
        y: 180,
      },
      deltaY: -100,
    });
    trace.edge(flowEdge("source.native-map-wheel.forward-request", "inert.no-native-map-target", {
      phase: "zoom",
      terminal: "intentionally-inert",
    }));
    return result;
  });

  assert.equal(pan, null);
  assert.equal(zoom, false);
  assert.deepEqual(dispatched, []);
  assert.deepEqual(trace.edges, [
    flowEdge("source.native-map-pan.start", "inert.no-native-map-target", {
      phase: "pan",
      terminal: "intentionally-inert",
    }),
    flowEdge("source.native-map-wheel.forward-request", "inert.no-native-map-target", {
      phase: "zoom",
      terminal: "intentionally-inert",
    }),
  ]);
});

function createGestureTrace(test) {
  return createFlowTrace({
    file: import.meta.url,
    test,
  });
}

function pointerDispatchEdges(source, phase) {
  return [
    flowEdge(source, "port.forward-native-map-pointer", {
      phase,
      provider: "gesture-forwarding-adapter",
    }),
    flowEdge("port.forward-native-map-pointer", "sink.native-map-pointer-dispatch", {
      phase,
      terminal: "port-result",
    }),
  ];
}
