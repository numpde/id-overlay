import test from "node:test";
import assert from "node:assert/strict";

import {
  createContentOverlayTrace,
  createStartedContentHarness,
  durableImageState,
  flushMicrotasks,
  placement,
  renderedOverlayImage,
  startContent,
  traceContentOverlayEdit,
} from "../../support/extension-content-overlay-harness.js";
import {
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: rendered overlay opacity gestures belong to Align, where the overlay
// image is an input surface. Trace is a native-map posture; opacity remains a
// product capability through semantic controls, but not by swallowing map wheel
// input on the painted overlay.
test("extension content commits rendered Align alt-wheel opacity", async () => {
  const trace = createTrace("extension content commits rendered Align alt-wheel opacity");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      opacity: 0.6,
      placement: placement(),
    }),
  });

  await startContent({ trace, window, chromeApi, phase: "align" });
  const wheel = altWheelEvent(window);
  renderedOverlayImage(window.document).dispatchEvent(wheel);
  await flushMicrotasks();

  assert.equal(wheel.defaultPrevented, true);
  assert.equal(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.opacity, 0.7);
  traceContentOverlayEdit(trace, "alt-wheel-align", "command.set-opacity");
});

// Class-b: the panel opacity slider is the visible semantic opacity control.
// Dragging it must flow through the browser shell into durable application state,
// not stop as a local DOM-only range value.
test("extension content commits rendered panel opacity slider input", async () => {
  const trace = createTrace("extension content commits rendered panel opacity slider input");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      opacity: 0.6,
      placement: placement(),
    }),
  });

  await startContent({ trace, window, chromeApi, phase: "panel-opacity" });
  const opacity = renderedPanelOpacityControl(window.document);
  assert.equal(opacity.value, "0.6");
  trace.withSource("source.rendered-panel.opacity.input", () => {
    opacity.value = "0.25";
    opacity.dispatchEvent(new window.Event("input", {
      bubbles: true,
      composed: true,
    }));
  });
  await flushMicrotasks();

  assert.equal(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.opacity, 0.25);
  assert.equal(renderedOverlayImage(window.document).style.opacity, "0.25");
  trace.edge(flowEdge("source.rendered-panel.opacity.input", "command.set-opacity", {
    phase: "panel-opacity",
    provider: "extension-ui-host",
  }));
  trace.edge(flowEdge("command.set-opacity", "effect.persist-durable-state", {
    phase: "panel-opacity",
    provider: "application-effect",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase: "panel-opacity",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase: "panel-opacity",
    terminal: "storage-write",
  }));
});

// Class-b: Trace pass-through includes modifier wheel input. A painted Trace
// overlay must not intercept Alt-wheel before the native map/browser can see it.
test("extension content leaves rendered Trace alt-wheel as browser pass-through", async () => {
  const trace = createTrace("extension content leaves rendered Trace alt-wheel as browser pass-through");
  const initialState = durableImageState({
    mode: "trace",
    opacity: 0.6,
    placement: placement(),
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: initialState,
  });

  await startContent({ trace, window, chromeApi, phase: "trace" });
  const image = renderedOverlayImage(window.document);
  const wheel = altWheelEvent(window);
  image.dispatchEvent(wheel);
  await flushMicrotasks();

  assert.equal(image.style.pointerEvents, "none");
  assert.equal(wheel.defaultPrevented, false);
  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"], undefined);
  assert.deepEqual(chromeApi.records["id-overlay.durable-state"], initialState);
  trace.edge(flowEdge("source.rendered-overlay.trace-alt-wheel", "sink.native-browser-hit-testing", {
    phase: "trace-alt-wheel-pass-through",
    terminal: "pass-through",
  }));
});

function createTrace(testName) {
  return createContentOverlayTrace({
    file: import.meta.url,
    test: testName,
  });
}

function altWheelEvent(window) {
  return new window.WheelEvent("wheel", {
    altKey: true,
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 600,
    clientY: 320,
    deltaY: -100,
  });
}

function renderedPanelOpacityControl(document) {
  const host = document.getElementById("id-overlay");
  assert.ok(host, "extension content must mount the owned UI root");
  const opacity = host.shadowRoot.querySelector("[data-control='opacity']");
  assert.ok(opacity, "loaded session must render the opacity control");
  return opacity;
}
