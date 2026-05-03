import test from "node:test";
import assert from "node:assert/strict";

import { createDomEnvironment } from "../helpers/dom-env.js";
import { repoFileUrl } from "../helpers/paths.js";
import { WHEEL_MODE } from "../../src/core/interaction-policy.js";
import { createInteractionController } from "../../src/content/interaction-controller.js";
import { MACHINE_EVENT_KIND } from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { SESSION_MODE } from "../../src/core/session.js";
import { createPlacementTransform } from "../../src/core/transform.js";

const DEFAULT_OVERLAY_IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

const DEFAULT_MAP_CENTER = Object.freeze({ lat: 0, lon: 0 });

test("overlay double-click toggles pins through the interaction controller", async () => {
  const env = createDomEnvironment();

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?o=${Date.now()}`);
    const map = env.document.getElementById("map") ?? env.document.body;

    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.ALIGN,
    }));

    let mapClickCount = 0;
    let mapDoubleClickCount = 0;
    map.addEventListener("click", () => {
      mapClickCount += 1;
    });
    map.addEventListener("dblclick", () => {
      mapDoubleClickCount += 1;
    });
    const pageAdapter = createStaticOverlayPageAdapter({ map });
    const interactions = createInteractionController({
      machineHost,
      pageAdapter,
      keyTarget: env.window,
    });
    const overlay = createOverlay({
      pageAdapter,
      machineHost,
      interactions,
    });

    const event = new env.window.MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
    });
    map.dispatchEvent(event);

    assert.deepEqual(machineHost.getState().session.registration.pins, [{
      id: 1,
      imagePx: { x: 412, y: 88 },
      mapLatLon: { lat: -1.6, lon: 1.68 },
    }]);
    assert.equal(event.defaultPrevented, true);
    assert.equal(mapDoubleClickCount, 0);

    const clickEvent = new env.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
    });
    map.dispatchEvent(clickEvent);
    assert.equal(clickEvent.defaultPrevented, true);
    assert.equal(mapClickCount, 0);

    overlay.destroy();
    interactions.destroy();
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
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.ALIGN,
    }));
    let mapWheelCount = 0;
    map.addEventListener("wheel", () => {
      mapWheelCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: createStaticOverlayPageAdapter({ map }),
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost, {
        handleWheel() {
          return true;
        },
      }),
    });

    const event = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
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

test("plain wheel over the overlay in align mode is forwarded manually and does not bubble into the underlying map", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?own=${Date.now()}`);
    const map = env.document.getElementById("map");
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.ALIGN,
    }));
    let mapWheelCount = 0;
    let handledWheelCount = 0;
    map.addEventListener("wheel", () => {
      mapWheelCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: createStaticOverlayPageAdapter({ map }),
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost, {
        handleWheel() {
          handledWheelCount += 1;
          return true;
        },
      }),
    });

    const event = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
      deltaY: -100,
    });
    map.dispatchEvent(event);

    assert.equal(handledWheelCount, 1);
    assert.equal(event.defaultPrevented, true);
    assert.equal(mapWheelCount, 0);

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
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.TRACE,
    }));
    const callLog = [];
    let mapWheelCount = 0;
    map.addEventListener("wheel", () => {
      mapWheelCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: createStaticOverlayPageAdapter({ map }),
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost, {
        handleWheel(payload) {
          callLog.push(payload);
          return true;
        },
      }),
    });

    const event = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
      deltaY: 100,
      altKey: true,
    });
    map.dispatchEvent(event);

    assert.deepEqual(callLog, [{
      deltaY: 100,
      wheelMode: WHEEL_MODE.ADJUST_OPACITY,
      screenPoint: { x: 512, y: 288 },
    }]);
    assert.equal(event.defaultPrevented, true);
    assert.equal(mapWheelCount, 0);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("align-mode overlay pointerdown owns the click sequence and does not bubble into the underlying map", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?op=${Date.now()}`);
    const map = env.document.getElementById("map");
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.ALIGN,
    }));
    let mapPointerDownCount = 0;
    let handledPointerDownCount = 0;
    map.addEventListener("pointerdown", () => {
      mapPointerDownCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: createStaticOverlayPageAdapter({ map }),
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost, {
        handlePointerDown() {
          handledPointerDownCount += 1;
          return true;
        },
      }),
    });

    const event = new env.window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
      button: 0,
    });
    map.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(mapPointerDownCount, 0);
    assert.equal(handledPointerDownCount, 0);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("plain pointerdown over the overlay in align mode owns the click sequence without starting a drag", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?opp=${Date.now()}`);
    const map = env.document.getElementById("map");
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.ALIGN,
    }));
    let mapPointerDownCount = 0;
    let handledPointerMoveCount = 0;
    let handledPointerDownCount = 0;
    map.addEventListener("pointerdown", () => {
      mapPointerDownCount += 1;
    });

    const overlay = createOverlay({
      pageAdapter: createStaticOverlayPageAdapter({ map }),
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost, {
        handlePointerMove() {
          handledPointerMoveCount += 1;
        },
        handlePointerDown() {
          handledPointerDownCount += 1;
          return false;
        },
      }),
    });

    const event = new env.window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
      button: 0,
    });
    map.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(mapPointerDownCount, 0);
    assert.equal(handledPointerMoveCount, 0);
    assert.equal(handledPointerDownCount, 0);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("trace-mode solved transform follows map view changes from the page adapter", async () => {
  const env = createDomEnvironment();

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?o2=${Date.now()}`);

    const sessionImage = {
      src: "data:image/png;base64,abc",
      width: 100,
      height: 50,
    };
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.TRACE,
      image: sessionImage,
      placement: createPlacementTransform({
        image: sessionImage,
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
    }));

    let snapshot = {
      viewportElement: env.document.getElementById("map") ?? env.document.body,
      mountElement: env.document.getElementById("map") ?? env.document.body,
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
        clientPointToScreen(point) {
          return point;
        },
      },
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const image = env.document.querySelector(".id-overlay-image");
    assert.equal(image.style.left, "372px");
    assert.equal(image.style.top, "272px");

    snapshot = {
      viewportElement: env.document.getElementById("map") ?? env.document.body,
      mountElement: env.document.getElementById("map") ?? env.document.body,
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

    const sessionImage = {
      src: "data:image/png;base64,abc",
      width: 100,
      height: 50,
    };
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.TRACE,
      image: sessionImage,
      placement: createPlacementTransform({
        image: sessionImage,
        centerMapLatLon: DEFAULT_MAP_CENTER,
        scale: 1,
        rotationRad: 0,
        zoom: 0,
      }),
      registration: {
        pins: [
          {
            id: 1,
            imagePx: { x: 10, y: 15 },
            mapLatLon: { lat: 0, lon: 0 },
          },
        ],
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
    }));

    let snapshot = {
      viewportElement: env.document.getElementById("map") ?? env.document.body,
      mountElement: env.document.getElementById("map") ?? env.document.body,
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
        clientPointToScreen(point) {
          return point;
        },
        mapToScreen(point) {
          return {
            x: 428 + point.lon * 50,
            y: 208 - point.lat * 50,
          };
        },
        mapToOverlayLayerScreen(point) {
          return this.mapToScreen(point);
        },
      },
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost),
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
    assert.equal(env.document.querySelectorAll(".id-overlay-map-pin").length, 0);
    assert.equal(env.document.querySelectorAll(".id-overlay-pin").length, 0);

    machineHost.dispatch({ type: MACHINE_EVENT_KIND.CLEAR_PINS });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(env.document.querySelectorAll(".id-overlay-map-pin").length, 0);
    assert.equal(env.document.querySelectorAll(".id-overlay-pin").length, 0);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

test("global pointer listeners retarget when the overlay remounts during a pending sequence", async () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map-a"></div><iframe id="map-frame"></iframe>',
  });

  try {
    const { createOverlay } = await import(`${repoFileUrl("src/content/overlay.js")}?retarget=${Date.now()}`);
    const mapA = env.document.getElementById("map-a");
    const frame = env.document.getElementById("map-frame");
    const frameDocument = frame.contentDocument;
    frameDocument.body.innerHTML = '<div id="map-b"></div>';
    const mapB = frameDocument.getElementById("map-b");
    const machineHost = createOverlayMachineHost(createOverlaySession({
      mode: SESSION_MODE.ALIGN,
    }));
    let snapshot = createStaticOverlaySnapshot({ map: mapA });
    let snapshotListener = null;
    let handledPointerMoveCount = 0;
    let handledPointerDownCount = 0;

    const overlay = createOverlay({
      pageAdapter: {
        ...createStaticOverlayPageAdapter({ map: mapA }),
        getSnapshot() {
          return snapshot;
        },
        subscribe(listener) {
          snapshotListener = listener;
          listener(snapshot);
          return () => {
            snapshotListener = null;
          };
        },
      },
      machineHost,
      interactions: createOverlayInteractionsDouble(machineHost, {
        handlePointerMove() {
          handledPointerMoveCount += 1;
        },
        handlePointerDown() {
          handledPointerDownCount += 1;
          return true;
        },
      }),
    });

    mapA.dispatchEvent(new env.window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 512,
      clientY: 288,
      button: 0,
    }));

    snapshot = createStaticOverlaySnapshot({ map: mapB });
    snapshotListener(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));

    env.window.dispatchEvent(new env.window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: 520,
      clientY: 288,
    }));

    assert.equal(handledPointerMoveCount, 0);
    assert.equal(handledPointerDownCount, 0);

    frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: 520,
      clientY: 288,
    }));

    assert.equal(handledPointerMoveCount, 1);
    assert.equal(handledPointerDownCount, 1);

    overlay.destroy();
  } finally {
    env.cleanup();
  }
});

function createOverlayMachineHost(session) {
  return createMachineHost({ persistedSession: session });
}

function createOverlaySession({
  mode = SESSION_MODE.ALIGN,
  opacity = 0.6,
  image = DEFAULT_OVERLAY_IMAGE,
  placement = createPlacementTransform({
    image,
    centerMapLatLon: DEFAULT_MAP_CENTER,
    scale: 1,
    rotationRad: 0,
    zoom: 16,
  }),
  registration = null,
} = {}) {
  return {
    mode,
    opacity,
    image,
    placement,
    ...(registration ? { registration } : {}),
  };
}

function createOverlayInteractionsDouble(machineHost, overrides = {}) {
  return {
    getRuntimeState() {
      return machineHost.getState().runtime;
    },
    subscribe(listener, options) {
      return machineHost.subscribe((state) => listener(state.runtime), options);
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
    handleTogglePin() {
      return false;
    },
    ...overrides,
  };
}

function createStaticOverlayPageAdapter({ map }) {
  return {
    getSnapshot() {
      return createStaticOverlaySnapshot({ map });
    },
    subscribe(listener) {
      listener(this.getSnapshot());
      return () => {};
    },
    clientPointToScreen(point) {
      return point;
    },
    mapToScreen(point) {
      return {
        x: 428 + point.lon * 50,
        y: 208 - point.lat * 50,
      };
    },
    mapToOverlayLayerScreen(point) {
      return this.mapToScreen(point);
    },
    screenToMap(point) {
      return {
        lat: (208 - point.y) / 50,
        lon: (point.x - 428) / 50,
      };
    },
  };
}

function createStaticOverlaySnapshot({ map }) {
  return {
    viewportElement: map,
    mountElement: map,
    viewportRect: { left: 100, top: 200, width: 800, height: 400 },
    localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
    mapView: { center: DEFAULT_MAP_CENTER, zoom: 16 },
    surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
  };
}
