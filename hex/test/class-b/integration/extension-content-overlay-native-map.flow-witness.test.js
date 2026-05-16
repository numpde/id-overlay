import test from "node:test";
import assert from "node:assert/strict";

import {
  createContentOverlayTrace,
  createStartedContentHarness,
  dispatchPointer,
  dispatchWheel,
  durableImageState,
  flushMicrotasks,
  placement,
  renderedOverlayImage,
  startContent,
} from "../../support/extension-content-overlay-harness.js";
import {
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: unmodified overlay drag/wheel are native-map gestures. They should
// not accidentally commit overlay placement, pins, or opacity while routing to
// the native-map boundary.
test("extension content keeps rendered plain drag and wheel out of overlay durability", async () => {
  const trace = createTrace("extension content keeps rendered plain drag and wheel out of overlay durability");
  const initialState = durableImageState({
    mode: "align",
    placement: placement(),
    opacity: 0.6,
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: initialState,
  });

  await startContent({ trace, window, chromeApi });
  const image = renderedOverlayImage(window.document);
  dispatchPointer(window, image, "pointerdown", {
    clientX: 500,
    clientY: 300,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 560,
    clientY: 280,
  });
  dispatchPointer(window, window, "pointerup", {
    clientX: 560,
    clientY: 280,
  });
  dispatchWheel(window, image);
  await flushMicrotasks();

  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"], undefined);
  assert.deepEqual(chromeApi.records["id-overlay.durable-state"], initialState);
  trace.edge(flowEdge("source.rendered-overlay.plain-input", "callback.interaction-fact.native-map-gesture-requested", {
    phase: "plain-native-map",
    provider: "extension-ui-host",
  }));
  trace.edge(flowEdge("callback.interaction-fact.native-map-gesture-requested", "port.forward-native-map-gesture", {
    phase: "plain-native-map",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.forward-native-map-gesture", "sink.native-map-gesture-forwarded", {
    phase: "plain-native-map",
    terminal: "port-result",
  }));
});

// Class-b: Trace is not merely "overlay input becomes inert after dispatch".
// The content entrypoint must render the overlay as paint-only so native browser
// hit-testing can reach the map underneath.
test("extension content renders Trace overlay as browser pass-through", async () => {
  const trace = createTrace("extension content renders Trace overlay as browser pass-through");
  const initialState = durableImageState({
    mode: "trace",
    placement: placement(),
    opacity: 0.6,
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: initialState,
  });

  await startContent({ trace, window, chromeApi, phase: "trace-startup" });
  const image = renderedOverlayImage(window.document);
  const wheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 500,
    clientY: 300,
    deltaY: -100,
  });
  image.dispatchEvent(wheel);
  await flushMicrotasks();

  assert.equal(image.style.pointerEvents, "none");
  assert.equal(wheel.defaultPrevented, false);
  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"], undefined);
  assert.deepEqual(chromeApi.records["id-overlay.durable-state"], initialState);
  trace.edge(flowEdge("source.rendered-overlay.trace-input", "sink.native-browser-hit-testing", {
    phase: "trace-pass-through",
    terminal: "pass-through",
  }));
});

// Class-b: touchpads can emit wheel noise during an active pan. Once the
// extension has started a native-map pan on behalf of rendered overlay input,
// same-page wheel input is pan noise, not a fresh zoom command.
test("extension content suppresses page wheel while forwarded native-map pan is active", async () => {
  const trace = createTrace("extension content suppresses page wheel while forwarded native-map pan is active");
  const initialState = durableImageState({
    mode: "align",
    placement: placement(),
    opacity: 0.6,
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: initialState,
  });

  await startContent({ trace, window, chromeApi, phase: "forwarded-pan-startup" });
  const image = renderedOverlayImage(window.document);
  dispatchPointer(window, image, "pointerdown", {
    clientX: 500,
    clientY: 300,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 560,
    clientY: 280,
  });

  const wheel = nativeMapWheel(window);
  window.document.getElementById("map").dispatchEvent(wheel);
  dispatchPointer(window, window, "pointerup", {
    clientX: 560,
    clientY: 280,
  });
  await flushMicrotasks();

  assert.equal(wheel.defaultPrevented, true);
  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"], undefined);
  assert.deepEqual(chromeApi.records["id-overlay.durable-state"], initialState);
  trace.edge(flowEdge("source.rendered-overlay.plain-drag", "callback.interaction-fact.native-map-gesture-requested", {
    phase: "forwarded-pan-start",
    provider: "extension-ui-host",
  }));
  trace.edge(flowEdge("callback.interaction-fact.native-map-gesture-requested", "port.forward-native-map-gesture", {
    phase: "forwarded-pan-start",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("source.native-map.wheel", "inert.active-native-map-pan-wheel", {
    phase: "wheel-during-forwarded-pan",
    terminal: "intentionally-inert",
  }));
});

// Class-b: Trace pass-through lets the browser hit-test the native map
// directly. The same pan noise rule still applies after a deliberate map drag:
// wheel is suppressed until the pointer sequence ends.
test("extension content suppresses page wheel while direct native-map drag is active", async () => {
  const trace = createTrace("extension content suppresses page wheel while direct native-map drag is active");
  const initialState = durableImageState({
    mode: "trace",
    placement: placement(),
    opacity: 0.6,
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: initialState,
  });
  const map = window.document.getElementById("map");

  await startContent({ trace, window, chromeApi, phase: "direct-pan-startup" });
  dispatchPointer(window, map, "pointerdown", {
    clientX: 500,
    clientY: 300,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 540,
    clientY: 330,
  });
  const wheel = nativeMapWheel(window);
  map.dispatchEvent(wheel);
  dispatchPointer(window, window, "pointerup", {
    clientX: 540,
    clientY: 330,
  });
  await flushMicrotasks();

  assert.equal(wheel.defaultPrevented, true);
  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"], undefined);
  assert.deepEqual(chromeApi.records["id-overlay.durable-state"], initialState);
  trace.edge(flowEdge("source.native-map.drag", "sink.active-native-map-pan", {
    phase: "direct-pan-start",
    terminal: "runtime-state",
  }));
  trace.edge(flowEdge("source.native-map.wheel", "inert.active-native-map-pan-wheel", {
    phase: "wheel-during-direct-pan",
    terminal: "intentionally-inert",
  }));
});

function nativeMapWheel(window) {
  return new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 530,
    clientY: 315,
    deltaY: -100,
  });
}

function createTrace(testName) {
  return createContentOverlayTrace({
    file: import.meta.url,
    test: testName,
  });
}
