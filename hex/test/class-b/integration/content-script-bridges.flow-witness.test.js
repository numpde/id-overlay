import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  installSurfaceMotionBridge,
} from "../../../bootstrap/content-script-bridges.js";
import {
  SURFACE_MOTION_EVENT_TYPE,
} from "../../../adapters/page-osm-id/page-observation-runtime.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: the content-world side of the page bridge owns browser listeners.
// Installing the bridge may inject a page-world script, but the content session
// must still be able to release its own message/document subscriptions on
// teardown.
test("surface motion bridge returns a disposable content listener resource", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "surface motion bridge returns a disposable content listener resource",
  });
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://www.openstreetmap.org/edit#map=10/22.9/120.2",
  });
  const received = [];
  const bridge = installSurfaceMotionBridge({
    ownerWindow: window,
    chromeApi: null,
    onSurfaceMotion(surfaceMotion) {
      received.push(surfaceMotion);
      trace.edge(flowEdge(
        trace.activeSource() ?? "source.surface-motion.unattributed",
        "callback.surface-motion",
        {
          provider: "content-script-bridge",
        },
      ));
    },
  });

  dispatchSurfaceMotionMessage({
    trace,
    window,
    phase: "before-destroy-message",
    transformCss: "matrix(1, 0, 0, 1, 10, 5)",
  });
  dispatchSurfaceMotionEvent({
    trace,
    window,
    phase: "before-destroy-event",
    transformCss: "matrix(1, 0, 0, 1, 20, 5)",
  });
  bridge.destroy();
  bridge.destroy();
  dispatchSurfaceMotionMessage({
    trace,
    window,
    phase: "after-destroy-message",
    transformCss: "matrix(1, 0, 0, 1, 30, 5)",
  });
  dispatchSurfaceMotionEvent({
    trace,
    window,
    phase: "after-destroy-event",
    transformCss: "matrix(1, 0, 0, 1, 40, 5)",
  });

  assert.deepEqual(received.map((motion) => motion.transformCss), [
    "matrix(1, 0, 0, 1, 10, 5)",
    "matrix(1, 0, 0, 1, 20, 5)",
  ]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.surface-motion.before-destroy-message", "callback.surface-motion", {
      provider: "content-script-bridge",
    }),
    flowEdge("callback.surface-motion", "sink.surface-motion-fact", {
      phase: "before-destroy-message",
      terminal: "published-fact",
    }),
    flowEdge("source.surface-motion.before-destroy-event", "callback.surface-motion", {
      provider: "content-script-bridge",
    }),
    flowEdge("callback.surface-motion", "sink.surface-motion-fact", {
      phase: "before-destroy-event",
      terminal: "published-fact",
    }),
    flowEdge("source.surface-motion.after-destroy-message", "sink.browser-native-message", {
      phase: "after-destroy-message",
      terminal: "pass-through",
    }),
    flowEdge("source.surface-motion.after-destroy-event", "sink.browser-native-event", {
      phase: "after-destroy-event",
      terminal: "pass-through",
    }),
  ]);
});

function dispatchSurfaceMotionMessage({
  trace,
  window,
  phase,
  transformCss,
}) {
  const event = new window.MessageEvent("message", {
    data: surfaceMotionPayload(transformCss),
    origin: window.location.origin,
  });
  const receivedCount = trace.edges.length;
  trace.withSource(`source.surface-motion.${phase}`, () => {
    window.dispatchEvent(event);
  });
  if (trace.edges.length === receivedCount) {
    trace.edge(flowEdge(`source.surface-motion.${phase}`, "sink.browser-native-message", {
      phase,
      terminal: "pass-through",
    }));
    return;
  }
  trace.edge(flowEdge("callback.surface-motion", "sink.surface-motion-fact", {
    phase,
    terminal: "published-fact",
  }));
}

function dispatchSurfaceMotionEvent({
  trace,
  window,
  phase,
  transformCss,
}) {
  const event = new window.CustomEvent(SURFACE_MOTION_EVENT_TYPE, {
    detail: {
      transformCss,
      transformOriginCss: "0px 0px",
    },
  });
  const receivedCount = trace.edges.length;
  trace.withSource(`source.surface-motion.${phase}`, () => {
    window.document.dispatchEvent(event);
  });
  if (trace.edges.length === receivedCount) {
    trace.edge(flowEdge(`source.surface-motion.${phase}`, "sink.browser-native-event", {
      phase,
      terminal: "pass-through",
    }));
    return;
  }
  trace.edge(flowEdge("callback.surface-motion", "sink.surface-motion-fact", {
    phase,
    terminal: "published-fact",
  }));
}

function surfaceMotionPayload(transformCss) {
  return {
    source: "id-overlay",
    type: SURFACE_MOTION_EVENT_TYPE,
    surfaceMotion: {
      transformCss,
      transformOriginCss: "0px 0px",
    },
  };
}
