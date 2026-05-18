import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createContentOverlayTrace,
  createStartedContentHarness,
  dispatchKeyboard,
  dispatchPointer,
  flushMicrotasks,
  renderedOverlayImage,
  startContent,
} from "../../support/extension-content-overlay-harness.js";
import {
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: the browser content entrypoint is responsible for connecting the
// shell to the live iD editor frame, not merely to a separately injected page
// adapter in narrower tests.
test("extension content locks Trace overlay to embedded iD frame map facts", async () => {
  const trace = createTrace("extension content locks Trace overlay to embedded iD frame map facts");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "matrix(1, 0, 0, 1, 18, -12)",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-map-lock" });
  const image = renderedOverlayImage(window.document);
  const overlayRoot = renderedOverlayRoot(image);
  const mapLayer = renderedMapLayer(image);

  assert.equal(
    image.style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );
  assert.equal(overlayRoot.style.left, "320px");
  assert.equal(overlayRoot.style.top, "70px");
  assert.equal(overlayRoot.style.width, "700px");
  assert.equal(overlayRoot.style.height, "500px");
  assert.equal(overlayRoot.style.transform, "");
  assert.equal(overlayRoot.style.transformOrigin, "");
  assert.equal(mapLayer.style.transform, "matrix(1, 0, 0, 1, 18, -12)");
  assert.equal(mapLayer.style.transformOrigin, "0px 0px");
  traceEmbeddedMapLock(trace);
});

// Class-b: Align makes the overlay editable, but it does not detach it from the
// map. A map-locked Align placement must re-project when the embedded map pans
// or zooms so manual adjustment and map navigation share one spatial frame.
test("extension content keeps Align map-locked overlay moving with embedded map", async () => {
  const trace = createTrace("extension content keeps Align map-locked overlay moving with embedded map");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: alignMapLockedState(),
  });
  const { frameWindow } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-align-map-lock-startup" });
  const image = renderedOverlayImage(window.document);
  const overlayRoot = renderedOverlayRoot(image);

  assert.equal(overlayRoot.dataset.mode, "align");
  assert.equal(overlayRoot.dataset.passThrough, "false");
  assert.equal(image.style.pointerEvents, "auto");
  assert.equal(image.style.transform, "translate(322px, 322px) rotate(0rad) scale(1)");

  frameWindow.location.hash = "#map=0/0/1";
  frameWindow.dispatchEvent(new frameWindow.Event("hashchange"));
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(321.2888888888889px, 322px) rotate(0rad) scale(1)",
  );

  frameWindow.location.hash = "#map=1/0/0";
  frameWindow.dispatchEvent(new frameWindow.Event("hashchange"));
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(294px, 394px) rotate(0rad) scale(2)",
  );
  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"], undefined);

  trace.edge(flowEdge("source.embedded-id-frame-map-change", "port.page-snapshot.subscribe", {
    phase: "embedded-align-map-lock",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-align-map-lock",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-align-map-lock",
    terminal: "view-result",
  }));
});

// Class-b: OpenStreetMap edit can keep keyboard focus inside the embedded iD
// frame while the extension overlay is under the pointer in the host document.
// Align cursor affordances must therefore hear modifier keys from the active
// embedded map keyboard source immediately, not only after the next pointermove.
test("extension content updates Align cursor from embedded iD modifier keys", async () => {
  const trace = createTrace("extension content updates Align cursor from embedded iD modifier keys");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: alignMapLockedState(),
  });
  const { frameWindow } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-align-modifier-cursor" });
  const image = renderedOverlayImage(window.document);
  assert.equal(image.style.cursor, "grab");

  dispatchKeyboard(frameWindow, frameWindow.document, "keydown", {
    key: "Shift",
    shiftKey: true,
  });
  assert.equal(image.style.cursor, "move");

  dispatchKeyboard(frameWindow, frameWindow.document, "keyup", {
    key: "Shift",
    shiftKey: false,
  });
  assert.equal(image.style.cursor, "grab");

  dispatchKeyboard(frameWindow, frameWindow.document, "keydown", {
    key: "Control",
    ctrlKey: true,
  });
  assert.match(image.style.cursor, /nwse-resize$/u);
  dispatchKeyboard(frameWindow, frameWindow.document, "keyup", {
    key: "Control",
    ctrlKey: false,
  });
  assert.equal(image.style.cursor, "grab");

  dispatchKeyboard(frameWindow, frameWindow.document, "keydown", {
    key: "Alt",
    altKey: true,
  });
  assert.match(image.style.cursor, /alias$/u);
  dispatchKeyboard(frameWindow, frameWindow.document, "keyup", {
    key: "Alt",
    altKey: false,
  });
  assert.equal(image.style.cursor, "grab");

  trace.edge(flowEdge("source.embedded-id-frame-keyboard.modifier", "sink.rendered-overlay.cursor", {
    phase: "embedded-align-modifier-cursor",
    terminal: "render-result",
  }));
});

// Class-b: during native map zoom, iD renders scaled tiles. The content reader
// must treat the tile image's intrinsic CSS size as the tile size and the CSS
// transform scale as zoom; using the transformed screen rect as tile size
// double-counts zoom and projects the map-locked overlay far off-screen.
test("extension content keeps map-locked overlay visible from scaled embedded tiles", async () => {
  const trace = createTrace("extension content keeps map-locked overlay visible from scaled embedded tiles");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: alignScaledTileMapLockedState(),
  });
  installEmbeddedEditorFrame(window, {
    frameHash: "#map=10.36/22.9469/121.1725&background=Bing",
    surfaceTransform: "none",
    tile: {
      src: "https://ecn.t0.tiles.virtualearth.net/tiles/a1321233200.jpeg?g=15545&pr=odbl&n=z",
      transform: "matrix(1.28343, 0, 0, 1.28343, 156.046, 93.8479)",
      rect: {
        left: 156.046,
        top: 93.8479,
        width: 328.55808,
        height: 328.55808,
      },
      intrinsicSizePx: {
        width: 256,
        height: 256,
      },
    },
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-scaled-tile-map-lock" });
  assertTransformClose(
    renderedOverlayImage(window.document).style.transform,
    {
      x: 350,
      y: 250,
      scale: 1.3142323200000003,
    },
  );

  trace.edge(flowEdge("source.embedded-id-frame-scaled-tile", "port.page-snapshot.read", {
    phase: "embedded-scaled-tile-map-lock",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.read", "callback.live-map-snapshot", {
    phase: "embedded-scaled-tile-map-lock",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-scaled-tile-map-lock",
    terminal: "view-result",
  }));
});

// Class-b: a persisted Align placement may have been authored in screen
// coordinates, but with a live embedded map it must be recovered into the same
// map-locked contract before rendering.
test("extension content normalizes Align screen placement to embedded map lock", async () => {
  const trace = createTrace("extension content normalizes Align screen placement to embedded map lock");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: alignScreenState(),
  });
  const { frameWindow } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-align-screen-map-lock-startup" });
  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.placement, {
    x: 100,
    y: 200,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );

  frameWindow.location.hash = "#map=0/0/1";
  frameWindow.dispatchEvent(new frameWindow.Event("hashchange"));
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(321.2888888888889px, 322px) rotate(0rad) scale(1)",
  );

  frameWindow.location.hash = "#map=1/0/0";
  frameWindow.dispatchEvent(new frameWindow.Event("hashchange"));
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(294px, 394px) rotate(0rad) scale(2)",
  );

  trace.edge(flowEdge("source.extension-content-start", "port.page-snapshot.read", {
    phase: "embedded-align-screen-map-lock",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.read", "callback.live-map-snapshot", {
    phase: "embedded-align-screen-map-lock",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "command.startup-recovery", {
    phase: "embedded-align-screen-map-lock",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("command.startup-recovery", "effect.persist-durable-state", {
    phase: "embedded-align-screen-map-lock",
    provider: "startup-recovery",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase: "embedded-align-screen-map-lock",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase: "embedded-align-screen-map-lock",
    terminal: "storage-write",
  }));
  trace.edge(flowEdge("source.embedded-id-frame-map-change", "port.page-snapshot.subscribe", {
    phase: "embedded-align-screen-map-lock",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-align-screen-map-lock",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-align-screen-map-lock",
    terminal: "view-result",
  }));
});

// Class-b: the embedded iD frame can become observable after content startup.
// The first later embedded-frame snapshot must still recover an Align screen
// placement into map-world coordinates instead of leaving the overlay fixed.
test("extension content normalizes Align screen placement when embedded frame appears after startup", async () => {
  const trace = createTrace("extension content normalizes Align screen placement when embedded frame appears after startup");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: alignScreenState(),
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-align-late-frame-startup" });
  assert.equal(chromeApi.latestSet, undefined);

  installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });
  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.placement, {
    x: 100,
    y: 200,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );

  trace.edge(flowEdge("source.embedded-id-frame-attached", "port.page-snapshot.subscribe", {
    phase: "embedded-align-late-frame-map-lock",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-align-late-frame-map-lock",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "command.startup-recovery", {
    phase: "embedded-align-late-frame-map-lock",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("command.startup-recovery", "effect.persist-durable-state", {
    phase: "embedded-align-late-frame-map-lock",
    provider: "startup-recovery",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase: "embedded-align-late-frame-map-lock",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase: "embedded-align-late-frame-map-lock",
    terminal: "storage-write",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-align-late-frame-map-lock",
    terminal: "view-result",
  }));
});

// Class-b: Align edits are screen gestures over a map-locked placement. At
// zoomed map scales, the committed durable placement must convert the screen
// delta back into map-world units instead of storing raw CSS-pixel movement.
test("extension content commits Align shift-drag on map-locked overlay in map-world coordinates", async () => {
  const trace = createTrace("extension content commits Align shift-drag on map-locked overlay in map-world coordinates");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: alignMapLockedState(),
  });
  installEmbeddedEditorFrame(window, {
    frameHash: "#map=1/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-align-map-lock-edit-startup" });
  const image = renderedOverlayImage(window.document);
  assert.equal(image.style.transform, "translate(294px, 394px) rotate(0rad) scale(2)");

  dispatchPointer(window, image, "pointerdown", {
    clientX: 600,
    clientY: 450,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 660,
    clientY: 430,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointerup", {
    clientX: 660,
    clientY: 430,
    shiftKey: true,
  });
  await flushMicrotasks();

  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.placement, {
    x: 130,
    y: 190,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  trace.edge(flowEdge("source.rendered-align-map-locked-overlay.input", "callback.interaction-fact", {
    phase: "align-map-locked-shift-drag",
    provider: "extension-ui-host",
  }));
  trace.edge(flowEdge("callback.interaction-fact", "port.overlay-interaction-projection", {
    phase: "align-map-locked-shift-drag",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.overlay-interaction-projection", "callback.projected-placement-edit", {
    phase: "align-map-locked-shift-drag",
    provider: "overlay-interaction-projection-port",
  }));
  trace.edge(flowEdge("callback.projected-placement-edit", "command.commit-placement-edit", {
    phase: "align-map-locked-shift-drag",
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("command.commit-placement-edit", "effect.persist-durable-state", {
    phase: "align-map-locked-shift-drag",
    provider: "application-effect",
  }));
});

// Class-b: map lock is live. When the embedded iD map surface moves, the
// content entrypoint must publish the new frame snapshot and the rendered
// overlay must inherit the same page-surface motion.
test("extension content refreshes overlay surface motion from embedded iD frame", async () => {
  const trace = createTrace("extension content refreshes overlay surface motion from embedded iD frame");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { supersurface } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-map-lock-startup" });
  supersurface.style.transform = "matrix(1, 0, 0, 1, 44, -9)";
  window.dispatchEvent(new window.Event("resize"));
  await flushMicrotasks();
  const image = renderedOverlayImage(window.document);
  const overlayRoot = renderedOverlayRoot(image);
  const mapLayer = renderedMapLayer(image);

  assert.equal(overlayRoot.style.left, "320px");
  assert.equal(overlayRoot.style.top, "70px");
  assert.equal(overlayRoot.style.width, "700px");
  assert.equal(overlayRoot.style.height, "500px");
  assert.equal(overlayRoot.style.transform, "");
  assert.equal(overlayRoot.style.transformOrigin, "");
  assert.equal(mapLayer.style.transform, "matrix(1, 0, 0, 1, 44, -9)");
  assert.equal(mapLayer.style.transformOrigin, "0px 0px");
  trace.edge(flowEdge("source.embedded-id-frame-surface-motion", "port.page-snapshot.subscribe", {
    phase: "embedded-surface-motion",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-surface-motion",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-surface-motion",
    terminal: "view-result",
  }));
});

// Class-b: real iD map motion is published as style churn on the map
// supersurface. The browser shell must observe that surface fact directly,
// without relying on unrelated window resize/history events to happen nearby.
test("extension content refreshes overlay surface motion from embedded iD surface mutation", async () => {
  const trace = createTrace("extension content refreshes overlay surface motion from embedded iD surface mutation");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { supersurface } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-surface-mutation-startup" });
  supersurface.style.transform = "matrix(1.1, 0, 0, 1.1, 22, -13)";
  await flushMicrotasks();
  const image = renderedOverlayImage(window.document);
  const mapLayer = renderedMapLayer(image);

  assert.equal(mapLayer.style.transform, "matrix(1.1, 0, 0, 1.1, 22, -13)");
  assert.equal(mapLayer.style.transformOrigin, "0px 0px");
  trace.edge(flowEdge("source.embedded-id-frame-surface-style", "port.page-snapshot.subscribe", {
    phase: "embedded-surface-mutation",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-surface-mutation",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-surface-mutation",
    terminal: "view-result",
  }));
});

// Class-b: while iD is actively panning, the embedded hash can already point at
// the future settled center. The renderer must combine the old coherent center
// with the transient surface transform, not the new hash center plus the same
// transform, or the overlay visibly jumps during pan.
test("extension content retains embedded map center during active surface pan", async () => {
  const trace = createTrace("extension content retains embedded map center during active surface pan");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { frameWindow, supersurface } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-pan-startup" });
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );

  frameWindow.location.hash = "#map=0/0/1";
  supersurface.style.transform = "matrix(1, 0, 0, 1, 42, -17)";
  await flushMicrotasks();
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );
  assert.equal(
    renderedMapLayer(renderedOverlayImage(window.document)).style.transform,
    "matrix(1, 0, 0, 1, 42, -17)",
  );

  window.location.hash = frameWindow.location.hash;
  supersurface.style.transform = "matrix(1, 0, 0, 1, 0, 0)";
  await flushMicrotasks();
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(321.2888888888889px, 322px) rotate(0rad) scale(1)",
  );
  assert.equal(
    renderedMapLayer(renderedOverlayImage(window.document)).style.transform,
    "matrix(1, 0, 0, 1, 0, 0)",
  );

  trace.edge(flowEdge("source.embedded-id-frame-surface-motion", "port.page-snapshot.subscribe", {
    phase: "embedded-active-pan",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-active-pan",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-active-pan",
    terminal: "view-result",
  }));
});

// Class-b: iD does not promise that hash and surface style updates arrive in
// one microtask. Observation must read the visual frame as a settled batch. If
// the hash is observed first and surface motion a microtask later, the overlay
// must not render the future center and then snap back.
test("extension content coalesces hash-first active pan observations", async () => {
  const trace = createTrace("extension content coalesces hash-first active pan observations");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { frameWindow, supersurface } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-hash-first-pan-startup" });
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );

  frameWindow.location.hash = "#map=0/0/1";
  frameWindow.dispatchEvent(new frameWindow.Event("hashchange"));
  await Promise.resolve();
  supersurface.style.transform = "matrix(1, 0, 0, 1, 42, -17)";
  await flushMicrotasks();

  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );
  assert.equal(
    renderedMapLayer(renderedOverlayImage(window.document)).style.transform,
    "matrix(1, 0, 0, 1, 42, -17)",
  );

  trace.edge(flowEdge("source.embedded-id-frame-hash-change", "port.page-snapshot.subscribe", {
    phase: "embedded-hash-first-active-pan",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("source.embedded-id-frame-surface-motion", "port.page-snapshot.subscribe", {
    phase: "embedded-hash-first-active-pan",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-hash-first-active-pan",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-hash-first-active-pan",
    terminal: "view-result",
  }));
});

// Class-b: production Chrome also discovers map changes by polling the observed
// document signature. A poll that sees only a hash change is the same
// hash-first pan frame as a hashchange event: it must wait for possible surface
// motion instead of rendering a one-frame jump.
test("extension content coalesces polled hash-first active pan observations", async () => {
  const trace = createTrace("extension content coalesces polled hash-first active pan observations");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const intervalCallbacks = [];
  const timeoutCallbacks = [];
  const originalSetInterval = window.setInterval.bind(window);
  const originalSetTimeout = window.setTimeout.bind(window);
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 Chrome/147.0.0.0",
  });
  window.setInterval = (callback, delay) => {
    if (delay === 50) {
      intervalCallbacks.push(callback);
      return 1001 + intervalCallbacks.length;
    }
    return originalSetInterval(callback, delay);
  };
  window.setTimeout = (callback, delay) => {
    timeoutCallbacks.push(callback);
    return 2001 + timeoutCallbacks.length;
  };
  window.clearTimeout = () => {};
  const { frameWindow, supersurface } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-polled-hash-first-pan-startup" });
  assert.equal(intervalCallbacks.length, 1);
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );

  frameWindow.location.hash = "#map=0/0/1";
  intervalCallbacks[0]();
  await Promise.resolve();
  assert.equal(timeoutCallbacks.length, 1);
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );

  supersurface.style.transform = "matrix(1, 0, 0, 1, 42, -17)";
  intervalCallbacks[0]();
  await Promise.resolve();
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );
  assert.equal(
    renderedMapLayer(renderedOverlayImage(window.document)).style.transform,
    "matrix(1, 0, 0, 1, 42, -17)",
  );

  trace.edge(flowEdge("source.polled-embedded-id-frame-hash", "port.page-snapshot.subscribe", {
    phase: "embedded-polled-hash-first-active-pan",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("source.polled-embedded-id-frame-surface-motion", "port.page-snapshot.subscribe", {
    phase: "embedded-polled-hash-first-active-pan",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-polled-hash-first-active-pan",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-polled-hash-first-active-pan",
    terminal: "view-result",
  }));
});

// Class-b: the embedded iD frame is an observed map window. A settled map hash
// change inside that frame must publish a fresh page snapshot even when no
// parent-window event or surface style mutation happens to cover for it.
test("extension content observes embedded iD frame hash changes directly", async () => {
  const trace = createTrace("extension content observes embedded iD frame hash changes directly");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { frameWindow } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-hash-startup" });
  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );

  window.history.replaceState(null, "", "https://www.openstreetmap.org/edit?editor=id#map=0/0/1");
  frameWindow.location.hash = "#map=0/0/1";
  frameWindow.dispatchEvent(new frameWindow.Event("hashchange"));
  await flushMicrotasks();

  assert.equal(
    renderedOverlayImage(window.document).style.transform,
    "translate(321.2888888888889px, 322px) rotate(0rad) scale(1)",
  );
  trace.edge(flowEdge("source.embedded-id-frame-hash-change", "port.page-snapshot.subscribe", {
    phase: "embedded-hash-change",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-hash-change",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-hash-change",
    terminal: "view-result",
  }));
});

// Class-b: an embedded iD frame is a live observation source only while it is
// still the active readable frame. Removing it from the host page must dispose
// its frame-window listeners instead of leaving a dangling source that can keep
// publishing page snapshot work after the frame is gone.
test("extension content disposes embedded frame observation listeners when the frame is removed", async () => {
  const trace = createTrace(
    "extension content disposes embedded frame observation listeners when the frame is removed",
  );
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { iframe, frameWindow } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });
  const listenerProbe = instrumentNavigationListeners(frameWindow);

  await startContent({ trace, window, chromeApi, phase: "embedded-listener-startup" });
  assert.deepEqual(listenerProbe.added(), ["hashchange", "popstate", "resize"]);

  trace.edge(flowEdge("source.embedded-id-frame-remove", "resource.embedded-frame-observation-listeners", {
    case: "embedded-frame-removed",
    phase: "embedded-frame-removed",
    resource: "embedded-frame-navigation-listeners",
    surface: "browser-event-loop",
    provider: "extension-content",
  }));
  iframe.remove();
  await flushMicrotasks();

  assert.deepEqual(listenerProbe.removed(), ["hashchange", "popstate", "resize"]);
  trace.edge(flowEdge("resource.embedded-frame-observation-listeners", "sink.embedded-frame-observation-listeners.disposed", {
    case: "embedded-frame-removed",
    phase: "embedded-frame-removed",
    resource: "embedded-frame-navigation-listeners",
    surface: "browser-event-loop",
    terminal: "host-resource-disposed",
  }));
});

// Class-b: in Chromium, iD mutates map surface style in the page execution
// world. The page-world bridge publishes that fact as document data; the
// content renderer, not the bridge, must turn the bridged fact into overlay DOM.
test("extension content renders bridged page-world surface motion facts", async () => {
  const trace = createTrace("extension content renders bridged page-world surface motion facts");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { frameWindow } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "bridged-surface-motion-startup" });
  publishBridgedSurfaceMotion(frameWindow, {
    transformCss: "matrix(1.1, 0, 0, 1.1, 22, -13)",
    transformOriginCss: "0px 0px",
  });
  await flushMicrotasks();
  assert.equal(
    renderedMapLayer(renderedOverlayImage(window.document)).style.transform,
    "matrix(1.1, 0, 0, 1.1, 22, -13)",
  );

  publishBridgedSurfaceMotion(frameWindow, {
    transformCss: "matrix(1, 0, 0, 1, 0, 0)",
    transformOriginCss: "0px 0px",
  });
  await flushMicrotasks();
  assert.equal(
    renderedMapLayer(renderedOverlayImage(window.document)).style.transform,
    "matrix(1, 0, 0, 1, 0, 0)",
  );

  trace.edge(flowEdge("source.page-world-surface-motion", "port.page-snapshot.subscribe", {
    phase: "bridged-surface-motion",
    provider: "surface-motion-page-bridge",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "bridged-surface-motion",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "bridged-surface-motion",
    terminal: "view-result",
  }));
});

// Class-b: page-world bridge facts are a fallback transport, not permission to
// ignore the directly readable live surface. During a real pan the bridge can
// briefly lag at identity while the supersurface style is already active; the
// renderer must carry the active surface transform or the map-locked overlay
// will retain the old center without moving with the map.
test("extension content prefers active embedded surface motion over stale bridged identity", async () => {
  const trace = createTrace(
    "extension content prefers active embedded surface motion over stale bridged identity",
  );
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceRegisteredState(),
  });
  const { frameWindow, supersurface } = installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "none",
  });

  await startContent({ trace, window, chromeApi, phase: "stale-bridge-startup" });
  publishBridgedSurfaceMotion(frameWindow, {
    transformCss: "matrix(1, 0, 0, 1, 0, 0)",
    transformOriginCss: "0px 0px",
  });
  supersurface.style.transform = "matrix(1, 0, 0, 1, 33, -11)";
  await flushMicrotasks();

  assert.equal(
    renderedMapLayer(renderedOverlayImage(window.document)).style.transform,
    "matrix(1, 0, 0, 1, 33, -11)",
  );

  trace.edge(flowEdge("source.embedded-id-frame-surface-style", "port.page-snapshot.subscribe", {
    phase: "stale-bridge-active-surface",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "stale-bridge-active-surface",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "stale-bridge-active-surface",
    terminal: "view-result",
  }));
});

// Class-b: Trace is a map-locked viewing posture for any loaded reference
// image whose placement has been normalized into map-world coordinates. Even
// without registration pins or solved-transform provenance, the rendered overlay
// must use the same map-locked placement projection and inherit the embedded iD
// surface motion.
test("extension content locks unsolved Trace overlay to embedded iD surface motion", async () => {
  const trace = createTrace("extension content locks unsolved Trace overlay to embedded iD surface motion");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: traceUnregisteredState(),
  });
  installEmbeddedEditorFrame(window, {
    frameHash: "#map=0/0/0",
    surfaceTransform: "matrix(1.2, 0, 0, 1.2, 28, -16)",
  });

  await startContent({ trace, window, chromeApi, phase: "embedded-unsolved-map-lock" });
  const image = renderedOverlayImage(window.document);
  const overlayRoot = renderedOverlayRoot(image);
  const mapLayer = renderedMapLayer(image);

  assert.equal(
    image.style.transform,
    "translate(322px, 322px) rotate(0rad) scale(1)",
  );
  assert.equal(overlayRoot.style.left, "320px");
  assert.equal(overlayRoot.style.top, "70px");
  assert.equal(overlayRoot.style.width, "700px");
  assert.equal(overlayRoot.style.height, "500px");
  assert.equal(overlayRoot.style.transform, "");
  assert.equal(overlayRoot.style.transformOrigin, "");
  assert.equal(mapLayer.style.transform, "matrix(1.2, 0, 0, 1.2, 28, -16)");
  assert.equal(mapLayer.style.transformOrigin, "0px 0px");
  trace.edge(flowEdge("source.extension-content-start", "port.page-snapshot.subscribe", {
    phase: "embedded-unsolved-map-lock",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-unsolved-map-lock",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-unsolved-map-lock",
    terminal: "view-result",
  }));
});

function traceRegisteredState() {
  return {
    session: {
      mode: "trace",
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
      registration: {
        pins: [
          {
            id: 1,
            imagePx: {
              x: 100,
              y: 200,
            },
            mapLatLon: {
              lat: 0,
              lon: 0,
            },
          },
        ],
        solvedTransform: {
          type: "image-to-map-world",
          a: 1,
          b: 0,
          tx: 100,
          ty: 200,
          scale: 1,
          rotationRad: 0,
          pinIds: [1],
        },
      },
    },
  };
}

function traceUnregisteredState() {
  return {
    session: {
      mode: "trace",
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
      placement: {
        x: 100,
        y: 200,
        scale: 1,
        rotationRad: 0,
        coordinateSpace: "map-world",
      },
    },
  };
}

function alignMapLockedState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
      placement: {
        x: 100,
        y: 200,
        scale: 1,
        rotationRad: 0,
        coordinateSpace: "map-world",
      },
    },
  };
}

function alignScreenState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
      placement: {
        x: 642,
        y: 392,
        scale: 1,
        rotationRad: 0,
      },
    },
  };
}

function alignScaledTileMapLockedState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
      placement: {
        x: 214.14757969123755,
        y: 111.11881620747236,
        scale: 0.001,
        rotationRad: 0,
        coordinateSpace: "map-world",
      },
    },
  };
}

function installEmbeddedEditorFrame(window, {
  frameHash,
  surfaceTransform,
  tile = null,
}) {
  window.history.replaceState(null, "", `https://www.openstreetmap.org/edit?editor=id${frameHash}`);
  const iframe = window.document.createElement("iframe");
  iframe.id = "id-embed";
  defineRect(iframe, {
    left: 300,
    top: 40,
    width: 740,
    height: 560,
  });

  const frameDom = new JSDOM(
    "<!doctype html><html><body><div class='main-map'><div class='supersurface'></div></div></body></html>",
    {
      url: `https://www.openstreetmap.org/id${frameHash}`,
    },
  );
  Object.defineProperty(iframe, "contentWindow", {
    configurable: true,
    value: frameDom.window,
  });
  Object.defineProperty(iframe, "contentDocument", {
    configurable: true,
    value: frameDom.window.document,
  });
  const viewport = frameDom.window.document.querySelector(".main-map");
  const supersurface = frameDom.window.document.querySelector(".supersurface");
  defineRect(viewport, {
    left: 20,
    top: 30,
    width: 700,
    height: 500,
  });
  supersurface.style.transform = surfaceTransform;
  supersurface.style.transformOrigin = "0px 0px";
  if (tile) {
    const image = frameDom.window.document.createElement("img");
    image.className = "tile tile-center";
    image.src = tile.src;
    image.style.width = `${tile.intrinsicSizePx.width}px`;
    image.style.height = `${tile.intrinsicSizePx.height}px`;
    image.style.transform = tile.transform;
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: tile.intrinsicSizePx.width,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: tile.intrinsicSizePx.height,
    });
    defineRect(image, tile.rect);
    supersurface.append(image);
  }
  window.document.body.append(iframe);
  return {
    iframe,
    frameWindow: frameDom.window,
    viewport,
    supersurface,
  };
}

function defineRect(element, {
  left,
  top,
  width,
  height,
}) {
  element.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
}

function publishBridgedSurfaceMotion(frameWindow, surfaceMotion) {
  frameWindow.document.documentElement.dataset.idOverlaySurfaceMotion = JSON.stringify(surfaceMotion);
}

function instrumentNavigationListeners(window) {
  const added = [];
  const removed = [];
  const tracked = new Set(["hashchange", "popstate", "resize"]);
  const nativeAddEventListener = window.addEventListener.bind(window);
  const nativeRemoveEventListener = window.removeEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (tracked.has(type)) {
      added.push(type);
    }
    return nativeAddEventListener(type, listener, options);
  };
  window.removeEventListener = (type, listener, options) => {
    if (tracked.has(type)) {
      removed.push(type);
    }
    return nativeRemoveEventListener(type, listener, options);
  };
  return {
    added: () => added.slice(),
    removed: () => removed.slice(),
  };
}

function renderedOverlayRoot(image) {
  const root = image.closest("[data-region='overlay']");
  assert.ok(root, "overlay image must be owned by the rendered overlay layer");
  return root;
}

function renderedMapLayer(image) {
  const mapLayer = image.closest(".id-overlay-map-layer");
  assert.ok(mapLayer, "overlay image must be owned by the rendered map layer");
  return mapLayer;
}

function assertTransformClose(transform, {
  x,
  y,
  scale,
}) {
  const match = /^translate\((?<x>-?\d+(?:\.\d+)?)px, (?<y>-?\d+(?:\.\d+)?)px\) rotate\(0rad\) scale\((?<scale>-?\d+(?:\.\d+)?)\)$/u
    .exec(transform);
  assert.ok(match, `unexpected transform: ${transform}`);
  assert.equal(Math.abs(Number(match.groups.x) - x) < 1e-9, true);
  assert.equal(Math.abs(Number(match.groups.y) - y) < 1e-9, true);
  assert.equal(Math.abs(Number(match.groups.scale) - scale) < 1e-12, true);
}

function traceEmbeddedMapLock(trace) {
  trace.edge(flowEdge("source.extension-content-start", "port.page-snapshot.subscribe", {
    phase: "embedded-map-lock",
    provider: "extension-content",
  }));
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "embedded-map-lock",
    provider: "page-snapshot-adapter",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "embedded-map-lock",
    terminal: "view-result",
  }));
}

function createTrace(testName) {
  return createContentOverlayTrace({
    file: import.meta.url,
    test: testName,
  });
}
