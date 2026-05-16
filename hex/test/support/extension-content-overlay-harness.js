import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  startExtensionContent,
} from "../../bootstrap/extension-content.js";
import {
  applyAnchoredPlacementEdit,
  applyPlacementToPoint,
  invertPlacement,
} from "../../domain/placement.js";
import {
  createFlowTrace,
  flowEdge,
} from "./flow-trace.js";

export async function startContent({
  trace,
  window,
  chromeApi,
  phase = "startup",
}) {
  await trace.withSource("source.extension-content-start", async () => {
    const result = await startExtensionContent({
      document: window.document,
      ownerWindow: window,
      chromeApi,
      location: window.location,
    });
    assert.equal(result.kind, "started");
    trace.edge(flowEdge("source.extension-content-start", "sink.render", {
      phase,
      terminal: "view-result",
    }));
  });
}

export function traceContentOverlayEdit(trace, phase, commandNode) {
  trace.edge(flowEdge("source.rendered-overlay.input", "callback.interaction-fact", {
    phase,
    provider: "extension-ui-host",
  }));
  trace.edge(flowEdge("callback.interaction-fact", commandNode, {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge(commandNode, "effect.persist-durable-state", {
    phase,
    provider: "application-effect",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase,
    terminal: "storage-write",
  }));
}

export function createStartedContentHarness({ durableState }) {
  const { window } = new JSDOM("<!doctype html><html><body><div id='map'></div></body></html>", {
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.23/36.84",
  });
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete",
  });
  const chromeApi = createChromeApiHarness({
    "id-overlay.durable-state": durableState,
  });
  return {
    window,
    chromeApi,
  };
}

export function renderedOverlayImage(document) {
  const host = document.getElementById("id-overlay");
  assert.ok(host, "extension content must mount the owned UI root");
  const image = host.shadowRoot.querySelector("[data-overlay-image]");
  assert.ok(image, "loaded session must render an overlay image");
  return image;
}

export function dispatchPointer(window, target, type, options) {
  target.dispatchEvent(new window.MouseEvent(type, {
    button: 0,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  }));
}

export function dispatchMouse(window, target, type, options) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

export function dispatchWheel(window, target, modifiers = {}) {
  target.dispatchEvent(new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 600,
    clientY: 320,
    deltaY: -100,
    ...modifiers,
  }));
}

export function dispatchKeyboard(window, target, type, options) {
  const event = new window.KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

export function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function createContentOverlayTrace({ file, test }) {
  return createFlowTrace({
    file,
    test,
  });
}

export function durableImageState({
  mode,
  placement: placementData = undefined,
  opacity = undefined,
  pins = undefined,
} = {}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (placementData !== undefined) {
    session.placement = placementData;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

export function placement({
  x = 20,
  y = 10,
  scale = 1,
  rotationRad = 0,
} = {}) {
  return {
    x,
    y,
    scale,
    rotationRad,
  };
}

export function imagePxForScreenPx({ screenPx, placement: placementData }) {
  return screenPxToImagePx(screenPx, placementData);
}

export function legacyRotatedPlacement() {
  return legacyAnchoredPlacementEdit({
    kind: "rotate",
    deltaRad: 100 / 800,
  });
}

export function legacyScaledPlacement() {
  return legacyAnchoredPlacementEdit({
    kind: "scale",
    factor: Math.exp(100 / 400),
  });
}

export function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 580,
      y: 310,
    },
    mapLatLon: mapLatLonForHarnessScreenPx({
      x: 600,
      y: 320,
    }),
  };
}

export function mapLatLonForHarnessScreenPx(screenPx) {
  const centerWorld = worldFromLatLon({
    lat: -1.23,
    lon: 36.84,
  });
  const zoomScale = 2 ** 16;
  const viewportCenter = {
    x: 1024 / 2,
    y: 768 / 2,
  };
  return latLonFromWorld({
    x: centerWorld.x + (screenPx.x - viewportCenter.x) / zoomScale,
    y: centerWorld.y + (screenPx.y - viewportCenter.y) / zoomScale,
  });
}

function createChromeApiHarness(initialRecords) {
  const records = {
    ...initialRecords,
  };
  const harness = {
    records,
    latestSet: undefined,
    storage: {
      local: {
        async get(key) {
          return {
            [key]: records[key] ?? null,
          };
        },
        async set(record) {
          Object.assign(records, record);
          harness.latestSet = record;
        },
      },
    },
  };
  return harness;
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function screenPxToImagePx(screenPx, placementData) {
  return applyPlacementToPoint(screenPx, invertPlacement(placementData));
}

function worldFromLatLon({ lat, lon }) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: 256 * ((lon + 180) / 360),
    y: 256 * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}

function latLonFromWorld({ x, y }) {
  const lon = x / 256 * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / 256;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat,
    lon,
  };
}

function legacyAnchoredPlacementEdit(edit) {
  const base = placement();
  return applyAnchoredPlacementEdit({
    base,
    edit: {
      ...edit,
      anchorImagePx: applyPlacementToPoint({
        x: 600,
        y: 320,
      }, invertPlacement(base)),
    },
  });
}
