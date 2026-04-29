import test from "node:test";
import assert from "node:assert/strict";

import { createDomEnvironment } from "../helpers/dom-env.js";
import { repoFileUrl } from "../helpers/paths.js";
import { createStateStore } from "../../src/core/state.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { createValueStore } from "../../src/core/value-store.js";

test("overlay double-click toggles pins through the shared interaction path", async () => {
  const env = createDomEnvironment();

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?o=${Date.now()}`);
    const map = env.document.getElementById("map") ?? env.document.body;

    const store = createStateStore({
      mode: "align",
      opacity: 0.6,
      image: {
        src: "data:image/png;base64,abc",
        width: 800,
        height: 400,
      },
      placement: createPlacementTransform({
        image: { width: 800, height: 400 },
        centerMapLatLon: { lat: 0, lon: 0 },
        scale: 1,
        rotationRad: 0,
        zoom: 16,
      }),
    });

    const runtimeStore = createValueStore({
      canCapturePointer: true,
      isDragging: false,
      isPointerInsideImage: true,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
    });

    const callLog = [];
    const overlay = createOverlay({
      pageAdapter: {
        getSnapshot() {
          return {
            viewportRect: { left: 100, top: 200, width: 800, height: 400 },
            localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
            mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
            surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
          };
        },
        subscribe(listener) {
          listener(this.getSnapshot());
          return () => {};
        },
        getOverlayMountElement() {
          return env.document.getElementById("map") ?? env.document.body;
        },
      },
      store,
      interactions: {
        getRuntimeState() {
          return runtimeStore.get();
        },
        subscribe(listener) {
          return runtimeStore.subscribe(listener);
        },
        handlePointerMove(point) {
          callLog.push(["move", point]);
        },
        handleDoubleClick(point) {
          callLog.push(["double-click", point]);
          return { ok: true };
        },
      },
    });

    const event = new env.window.MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      clientX: 412,
      clientY: 88,
    });
    map.dispatchEvent(event);

    assert.deepEqual(callLog, [["double-click", { x: 512, y: 288 }]]);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("handled overlay wheel gestures do not bubble into the underlying map", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?ow=${Date.now()}`);
    const map = env.document.getElementById("map");
    const store = createStateStore({
      mode: "align",
      opacity: 0.6,
      image: {
        src: "data:image/png;base64,abc",
        width: 800,
        height: 400,
      },
      placement: createPlacementTransform({
        image: { width: 800, height: 400 },
        centerMapLatLon: { lat: 0, lon: 0 },
        scale: 1,
        rotationRad: 0,
        zoom: 16,
      }),
    });
    const runtimeStore = createValueStore({
      canCapturePointer: true,
      isDragging: false,
      isPointerInsideImage: true,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
    });

    let mapWheelCount = 0;
    map.addEventListener("wheel", () => {
      mapWheelCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: {
        getSnapshot() {
          return {
            viewportRect: { left: 100, top: 200, width: 800, height: 400 },
            localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
            mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
            surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
          };
        },
        subscribe(listener) {
          listener(this.getSnapshot());
          return () => {};
        },
        getOverlayMountElement() {
          return map;
        },
      },
      store,
      interactions: {
        getRuntimeState() {
          return runtimeStore.get();
        },
        subscribe(listener) {
          return runtimeStore.subscribe(listener);
        },
        handlePointerEnter() {},
        handlePointerLeave() {},
        handlePointerMove() {},
        handlePointerDown() {
          return false;
        },
        handlePointerUp() {},
        handlePointerCancel() {},
        handleWheel() {
          return true;
        },
        handleDoubleClick() {
          return { ok: false };
        },
      },
    });

    const event = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 412,
      clientY: 88,
      deltaY: -100,
      shiftKey: true,
    });
    map.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(mapWheelCount, 0);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("plain wheel over the overlay in align mode stays native to the map", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?own=${Date.now()}`);
    const map = env.document.getElementById("map");
    const store = createStateStore({
      mode: "align",
      opacity: 0.6,
      image: {
        src: "data:image/png;base64,abc",
        width: 800,
        height: 400,
      },
      placement: createPlacementTransform({
        image: { width: 800, height: 400 },
        centerMapLatLon: { lat: 0, lon: 0 },
        scale: 1,
        rotationRad: 0,
        zoom: 16,
      }),
    });
    const runtimeStore = createValueStore({
      canCapturePointer: true,
      isDragging: false,
      isPointerInsideImage: true,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
    });

    let mapWheelCount = 0;
    let handledWheelCount = 0;
    map.addEventListener("wheel", () => {
      mapWheelCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: {
        getSnapshot() {
          return {
            viewportRect: { left: 100, top: 200, width: 800, height: 400 },
            localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
            mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
            surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
          };
        },
        subscribe(listener) {
          listener(this.getSnapshot());
          return () => {};
        },
        getOverlayMountElement() {
          return map;
        },
      },
      store,
      interactions: {
        getRuntimeState() {
          return runtimeStore.get();
        },
        subscribe(listener) {
          return runtimeStore.subscribe(listener);
        },
        handlePointerMove() {},
        handlePointerLeave() {},
        handlePointerDown() {
          return false;
        },
        handlePointerUp() {},
        handlePointerCancel() {},
        handleWheel() {
          handledWheelCount += 1;
          return true;
        },
        handleDoubleClick() {
          return { ok: false };
        },
      },
    });

    const event = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 412,
      clientY: 88,
      deltaY: -100,
    });
    map.dispatchEvent(event);

    assert.equal(handledWheelCount, 0);
    assert.equal(event.defaultPrevented, false);
    assert.equal(mapWheelCount, 1);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("alt-wheel in trace mode is captured from the map layer when the pointer is over the overlay", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?ot=${Date.now()}`);
    const map = env.document.getElementById("map");
    const store = createStateStore({
      mode: "trace",
      opacity: 0.6,
      image: {
        src: "data:image/png;base64,abc",
        width: 800,
        height: 400,
      },
      placement: createPlacementTransform({
        image: { width: 800, height: 400 },
        centerMapLatLon: { lat: 0, lon: 0 },
        scale: 1,
        rotationRad: 0,
        zoom: 16,
      }),
    });
    const runtimeStore = createValueStore({
      canCapturePointer: false,
      isDragging: false,
      isPointerInsideImage: false,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
    });

    const callLog = [];
    let mapWheelCount = 0;
    map.addEventListener("wheel", () => {
      mapWheelCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: {
        getSnapshot() {
          return {
            viewportRect: { left: 100, top: 200, width: 800, height: 400 },
            localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
            mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
            surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
          };
        },
        subscribe(listener) {
          listener(this.getSnapshot());
          return () => {};
        },
        getOverlayMountElement() {
          return map;
        },
      },
      store,
      interactions: {
        getRuntimeState() {
          return runtimeStore.get();
        },
        subscribe(listener) {
          return runtimeStore.subscribe(listener);
        },
        handlePointerEnter() {},
        handlePointerLeave() {},
        handlePointerMove() {},
        handlePointerDown() {
          return false;
        },
        handlePointerUp() {},
        handlePointerCancel() {},
        handleWheel(payload) {
          callLog.push(payload);
          return true;
        },
        handleDoubleClick() {
          return { ok: false };
        },
      },
    });

    const event = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 412,
      clientY: 288,
      deltaY: 100,
      altKey: true,
    });
    map.dispatchEvent(event);

    assert.deepEqual(callLog, [{
      deltaY: 100,
      shiftKey: false,
      altKey: true,
      ctrlKey: false,
      screenPoint: { x: 512, y: 488 },
    }]);
    assert.equal(event.defaultPrevented, true);
    assert.equal(mapWheelCount, 0);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("handled overlay pointerdown gestures do not bubble into the underlying map", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?op=${Date.now()}`);
    const map = env.document.getElementById("map");
    const store = createStateStore({
      mode: "align",
      opacity: 0.6,
      image: {
        src: "data:image/png;base64,abc",
        width: 800,
        height: 400,
      },
      placement: createPlacementTransform({
        image: { width: 800, height: 400 },
        centerMapLatLon: { lat: 0, lon: 0 },
        scale: 1,
        rotationRad: 0,
        zoom: 16,
      }),
    });
    const runtimeStore = createValueStore({
      canCapturePointer: true,
      isDragging: false,
      isPointerInsideImage: true,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
    });

    let mapPointerDownCount = 0;
    map.addEventListener("pointerdown", () => {
      mapPointerDownCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: {
        getSnapshot() {
          return {
            viewportRect: { left: 100, top: 200, width: 800, height: 400 },
            localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
            mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
            surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
          };
        },
        subscribe(listener) {
          listener(this.getSnapshot());
          return () => {};
        },
        getOverlayMountElement() {
          return map;
        },
      },
      store,
      interactions: {
        getRuntimeState() {
          return runtimeStore.get();
        },
        subscribe(listener) {
          return runtimeStore.subscribe(listener);
        },
        handlePointerEnter() {},
        handlePointerLeave() {},
        handlePointerMove() {},
        handlePointerDown() {
          return true;
        },
        handlePointerUp() {},
        handlePointerCancel() {},
        handleWheel() {
          return false;
        },
        handleDoubleClick() {
          return { ok: false };
        },
      },
    });

    const event = new env.window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 412,
      clientY: 88,
      button: 0,
      shiftKey: true,
    });
    map.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(mapPointerDownCount, 0);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("trace-mode solved transform follows map view changes from the page adapter", async () => {
  const env = createDomEnvironment();

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?o2=${Date.now()}`);

    const store = createStateStore({
      mode: "trace",
      opacity: 0.6,
      image: {
        src: "data:image/png;base64,abc",
        width: 100,
        height: 50,
      },
      placement: createPlacementTransform({
        image: { width: 100, height: 50 },
        centerMapLatLon: { lat: 99, lon: 99 },
        scale: 9,
        rotationRad: 1,
        zoom: 0,
      }),
      registration: {
        pins: [],
        solvedTransform: {
          type: "similarity",
          a: 1,
          b: 0,
          tx: 100,
          ty: 200,
          pinCount: 2,
        },
        dirty: false,
      },
    });

    const runtimeStore = createValueStore({
      canCapturePointer: false,
      isDragging: false,
      isPointerInsideImage: false,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
    });

    let snapshot = {
      viewportRect: { left: 0, top: 0, width: 800, height: 400 },
      localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
      mapView: { center: { lat: 0, lon: 0 }, zoom: 0 },
      surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
    };
    let listener = null;

    const overlay = createOverlay({
      pageAdapter: {
        getSnapshot() {
          return snapshot;
        },
        subscribe(nextListener) {
          listener = nextListener;
          nextListener(snapshot);
          return () => {
            listener = null;
          };
        },
        getOverlayMountElement() {
          return env.document.getElementById("map") ?? env.document.body;
        },
      },
      store,
      interactions: {
        getRuntimeState() {
          return runtimeStore.get();
        },
        subscribe(nextListener) {
          return runtimeStore.subscribe(nextListener);
        },
        handlePointerEnter() {},
        handlePointerLeave() {},
        handlePointerMove() {},
        handlePointerDown() {
          return false;
        },
        handlePointerUp() {},
        handlePointerCancel() {},
        handleWheel() {
          return false;
        },
        handleDoubleClick() {
          return { ok: false };
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const image = env.document.querySelector(".id-overlay-image");
    assert.equal(image.style.left, "372px");
    assert.equal(image.style.top, "272px");

    snapshot = {
      viewportRect: { left: 0, top: 0, width: 800, height: 400 },
      localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
      mapView: { center: { lat: 0, lon: 1 }, zoom: 0 },
      surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
    };
    listener(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(image.style.left, "371.2888888888889px");
    assert.equal(image.style.top, "272px");

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("trace-mode overlay applies live surface motion from the page adapter", async () => {
  const env = createDomEnvironment();

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?o3=${Date.now()}`);

    const store = createStateStore({
      mode: "trace",
      opacity: 0.6,
      image: {
        src: "data:image/png;base64,abc",
        width: 100,
        height: 50,
      },
      placement: createPlacementTransform({
        image: { width: 100, height: 50 },
        centerMapLatLon: { lat: 0, lon: 0 },
        scale: 1,
        rotationRad: 0,
        zoom: 0,
      }),
      registration: {
        pins: [],
        solvedTransform: {
          type: "similarity",
          a: 1,
          b: 0,
          tx: 100,
          ty: 200,
          pinCount: 2,
        },
        dirty: false,
      },
    });

    const runtimeStore = createValueStore({
      canCapturePointer: false,
      isDragging: false,
      isPointerInsideImage: false,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
    });

    let snapshot = {
      viewportRect: { left: 10, top: 20, width: 800, height: 400 },
      localViewportRect: { left: 10, top: 20, width: 800, height: 400 },
      mapView: { center: { lat: 0, lon: 0 }, zoom: 0 },
      surfaceMotion: {
        transformCss: "matrix(1, 0, 0, 1, 18, -12)",
        transformOriginCss: "0px 0px",
      },
    };

    const overlay = createOverlay({
      pageAdapter: {
        getSnapshot() {
          return snapshot;
        },
        subscribe(listener) {
          listener(snapshot);
          return () => {};
        },
        getOverlayMountElement() {
          return env.document.getElementById("map") ?? env.document.body;
        },
      },
      store,
      interactions: {
        getRuntimeState() {
          return runtimeStore.get();
        },
        subscribe(nextListener) {
          return runtimeStore.subscribe(nextListener);
        },
        handlePointerEnter() {},
        handlePointerLeave() {},
        handlePointerMove() {},
        handlePointerDown() {
          return false;
        },
        handlePointerUp() {},
        handlePointerCancel() {},
        handleWheel() {
          return false;
        },
        handleDoubleClick() {
          return { ok: false };
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const overlayRoot = env.document.querySelector(".id-overlay-viewport");
    const mapLayer = env.document.querySelector(".id-overlay-map-layer");
    const image = env.document.querySelector(".id-overlay-image");
    assert.equal(overlayRoot.style.left, "10px");
    assert.equal(overlayRoot.style.top, "20px");
    assert.equal(mapLayer.style.transform, "matrix(1, 0, 0, 1, 18, -12)");
    assert.equal(image.style.left, "372px");
    assert.equal(image.style.top, "272px");

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});
