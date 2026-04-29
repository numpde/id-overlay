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
    const host = env.document.createElement("div");
    env.document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });

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
      shadow,
      pageAdapter: {
        getSnapshot() {
          return {
            viewportRect: { left: 0, top: 0, width: 800, height: 400 },
            mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
            surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
          };
        },
        subscribe(listener) {
          listener(this.getSnapshot());
          return () => {};
        },
        mapToScreen(point) {
          return {
            x: 400 + point.lon * 100,
            y: 200 + point.lat * 100,
          };
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
        handlePointerEnter(point) {
          callLog.push(["enter", point]);
        },
        handlePointerLeave() {
          callLog.push(["leave"]);
        },
        handlePointerMove(point) {
          callLog.push(["move", point]);
        },
        handlePointerDown() {
          callLog.push(["down"]);
          return false;
        },
        handlePointerUp(point) {
          callLog.push(["up", point]);
        },
        handlePointerCancel() {
          callLog.push(["cancel"]);
        },
        handleWheel() {
          callLog.push(["wheel"]);
          return false;
        },
        handleDoubleClick(point) {
          callLog.push(["double-click", point]);
          return { ok: true };
        },
      },
      statusController: {
        subscribe(listener) {
          listener("");
          return () => {};
        },
      },
    });

    const image = shadow.querySelector(".id-overlay-image");
    const event = new env.window.MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
    });
    image.dispatchEvent(event);

    assert.deepEqual(callLog, [["double-click", { x: 512, y: 288 }]]);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("trace-mode solved transform follows map view changes from the page adapter", async () => {
  const env = createDomEnvironment();

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?o2=${Date.now()}`);
    const host = env.document.createElement("div");
    env.document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });

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
      mapView: { center: { lat: 0, lon: 0 }, zoom: 0 },
      surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
    };
    let listener = null;

    const overlay = createOverlay({
      shadow,
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
        mapToScreen() {
          throw new Error("solved transform path should not use placement mapToScreen");
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
      statusController: {
        subscribe(nextListener) {
          nextListener("");
          return () => {};
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const image = shadow.querySelector(".id-overlay-image");
    assert.equal(image.style.left, "372px");
    assert.equal(image.style.top, "272px");

    snapshot = {
      viewportRect: { left: 0, top: 0, width: 800, height: 400 },
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
    const host = env.document.createElement("div");
    env.document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });

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
      mapView: { center: { lat: 0, lon: 0 }, zoom: 0 },
      surfaceMotion: {
        transformCss: "matrix(1, 0, 0, 1, 18, -12)",
        transformOriginCss: "0px 0px",
      },
    };

    const overlay = createOverlay({
      shadow,
      pageAdapter: {
        getSnapshot() {
          return snapshot;
        },
        subscribe(listener) {
          listener(snapshot);
          return () => {};
        },
        mapToScreen() {
          throw new Error("solved transform path should not use placement mapToScreen");
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
      statusController: {
        subscribe(nextListener) {
          nextListener("");
          return () => {};
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const mapLayer = shadow.querySelector(".id-overlay-map-layer");
    const image = shadow.querySelector(".id-overlay-image");
    assert.equal(mapLayer.style.left, "10px");
    assert.equal(mapLayer.style.top, "20px");
    assert.equal(mapLayer.style.transform, "matrix(1, 0, 0, 1, 18, -12)");
    assert.equal(image.style.left, "372px");
    assert.equal(image.style.top, "272px");

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});
