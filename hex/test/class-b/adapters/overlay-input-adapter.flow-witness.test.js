import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: DOM tags, CSS serialization, and data
// markers are adapter-local handles. The stable boundary is narrower: overlay
// rendering consumes only view facts, never session-shaped product state.
test("overlay adapter renders from overlay view facts only", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter renders from overlay view facts only",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render({
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement: {
      x: 80,
      y: 40,
      scale: 1.25,
      rotationRad: 0.1,
    },
    opacity: 0.5,
    pins: [{
      id: 1,
      imagePx: {
        x: 320,
        y: 240,
      },
    }],
  });

  assert.equal(root.querySelectorAll("[data-overlay-image]").length, 1);
  assert.equal(
    root.querySelector("[data-overlay-image]").dataset.imageDataRef,
    "reference-image-data-1",
  );
  assert.equal(root.querySelector("[data-overlay-image]").style.width, "640px");
  assert.equal(root.querySelector("[data-overlay-image]").style.height, "480px");
  assert.equal(root.querySelector("[data-overlay-image]").style.opacity, "0.5");
  assert.equal(
    root.querySelector("[data-overlay-image]").style.transform,
    "translate(80px, 40px) rotate(0.1rad) scale(1.25)",
  );
  assert.equal(root.querySelectorAll("[data-registration-pin]").length, 1);
  assert.equal(
    root.querySelector("[data-registration-pin]").dataset.pinId,
    "1",
  );
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "overlay-view-facts",
    terminal: "render-result",
  }));
});

// Class-b: Trace projection carries live page surface motion as a render fact.
// The overlay adapter must apply that motion exactly once, on the rendered map
// layer that contains image/frame/pins. Applying the same motion to both the
// viewport root and the map layer makes the overlay overshoot while the map is
// moving, then snap back when the settled map snapshot arrives.
test("overlay adapter applies page surface motion exactly once to rendered map layer", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter applies page surface motion exactly once to rendered map layer",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render({
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement: {
      x: 742,
      y: 522,
      scale: 1,
      rotationRad: 0,
    },
    opacity: 0.5,
    pins: [],
    pageSurfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    },
  });

  const mapLayer = root.querySelector(".id-overlay-map-layer");
  assert.equal(root.style.transform, "");
  assert.equal(root.style.transformOrigin, "");
  assert.equal(mapLayer.style.transform, "matrix(1, 0, 0, 1, 18, -12)");
  assert.equal(mapLayer.style.transformOrigin, "0px 0px");
  assert.equal(
    root.querySelector("[data-overlay-image]").style.transform,
    "translate(742px, 522px) rotate(0rad) scale(1)",
  );
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "surface-motion",
    terminal: "render-result",
  }));
});

// Class-b: legacy renders a separate thin frame around the reference image.
// The frame is visible chrome, not input state: it must track the same rendered
// box as the image whether or not the image is currently interactive.
test("overlay adapter draws a thin legacy frame around the reference image", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter draws a thin legacy frame around the reference image",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render({
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement: {
      x: 80,
      y: 40,
      scale: 1.25,
      rotationRad: 0.1,
    },
    opacity: 0.5,
    pins: [],
  });

  const image = root.querySelector(".id-overlay-image");
  const frame = root.querySelector(".id-overlay-frame");
  const mapLayer = root.querySelector(".id-overlay-map-layer");
  assert.equal(mapLayer.style.position, "absolute");
  assert.equal(mapLayer.style.left, "0px");
  assert.equal(mapLayer.style.top, "0px");
  assert.equal(mapLayer.style.right, "0px");
  assert.equal(mapLayer.style.bottom, "0px");
  assert.equal(image.style.position, "absolute");
  assert.equal(frame.style.position, "absolute");
  assert.equal(frame.style.display, "block");
  assert.equal(frame.style.width, image.style.width);
  assert.equal(frame.style.height, image.style.height);
  assert.equal(frame.style.transform, image.style.transform);
  assert.equal(frame.style.transformOrigin, image.style.transformOrigin);
  assert.equal(frame.style.border, "1px solid rgba(15, 23, 42, 0.42)");
  assert.equal(frame.style.boxShadow, "inset 0 0 0 1px rgba(255, 255, 255, 0.36)");
  assert.equal(frame.style.boxSizing, "border-box");
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "legacy-reference-frame",
    terminal: "render-result",
  }));
});

// Class-b: legacy overlay UI has a concrete chrome structure. The rendered
// viewport is clipped to the active map viewport; live map motion is applied to
// an inner map layer; the reference image and interaction frame are separate
// elements; overlay pins and map pins render in separate layers.
test("overlay adapter renders legacy viewport map-layer image-frame chrome", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter renders legacy viewport map-layer image-frame chrome",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render({
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 100,
      height: 80,
    },
    placement: {
      x: 11,
      y: 12,
      scale: 1,
      rotationRad: Math.PI / 12,
    },
    opacity: 0.5,
    viewport: {
      mode: "align",
      isPassThrough: false,
      rect: {
        left: 10,
        top: 20,
        width: 300,
        height: 200,
      },
    },
    mapLayer: {
      transformOriginCss: "4px 5px",
      transformCss: "matrix(1, 0, 0, 1, 7, 8)",
    },
    image: {
      src: "https://example.test/reference.png",
      left: 11,
      top: 12,
      width: 100,
      height: 80,
      rotationDeg: 15,
      opacity: 0.5,
    },
    frame: {
      left: 11,
      top: 12,
      width: 100,
      height: 80,
      rotationDeg: 15,
      ownsPointerHitTesting: true,
    },
    mapPins: [{
        id: 1,
        left: 20,
        top: 30,
    }],
    pins: [{
        id: 2,
        imagePx: {
          x: 40,
          y: 50,
        },
    }],
  });

  assert.equal(root.className, "id-overlay-viewport");
  assert.equal(root.dataset.idOverlayOwned, "true");
  assert.equal(root.dataset.mode, "align");
  assert.equal(root.dataset.passThrough, "false");
  assert.equal(root.style.left, "10px");
  assert.equal(root.style.top, "20px");
  assert.equal(root.style.width, "300px");
  assert.equal(root.style.height, "200px");

  const mapLayer = root.querySelector(".id-overlay-map-layer");
  assert.equal(mapLayer.style.position, "absolute");
  assert.equal(mapLayer.style.left, "0px");
  assert.equal(mapLayer.style.top, "0px");
  assert.equal(mapLayer.style.right, "0px");
  assert.equal(mapLayer.style.bottom, "0px");
  assert.equal(mapLayer.style.transformOrigin, "4px 5px");
  assert.equal(mapLayer.style.transform, "matrix(1, 0, 0, 1, 7, 8)");

  const image = root.querySelector(".id-overlay-image");
  const frame = root.querySelector(".id-overlay-frame");
  assert.equal(image.tagName, "IMG");
  assert.equal(image.style.position, "absolute");
  assert.equal(frame.style.position, "absolute");
  assert.equal(image.alt, "");
  assert.equal(image.decoding, "async");
  assert.equal(image.getAttribute("src"), "https://example.test/reference.png");
  assert.equal(image.style.left, "11px");
  assert.equal(image.style.top, "12px");
  assert.equal(image.style.width, "100px");
  assert.equal(image.style.height, "80px");
  assert.equal(image.style.opacity, "0.5");
  assert.equal(image.style.transform, "rotate(15deg)");
  assert.equal(frame.style.pointerEvents, "auto");
  assert.equal(frame.style.transform, "rotate(15deg)");

  assert.deepEqual(
    [...root.querySelectorAll(".id-overlay-map-pin")].map((pin) => ({
      id: pin.dataset.pinId,
      text: pin.textContent,
      position: pin.style.position,
      left: pin.style.left,
      top: pin.style.top,
      width: pin.style.width,
      height: pin.style.height,
    })),
    [{
      id: "1",
      text: "1",
      position: "absolute",
      left: "20px",
      top: "30px",
      width: "14px",
      height: "14px",
    }],
  );
  const pinLayer = root.querySelector(".id-overlay-pin-layer");
  assert.equal(pinLayer.style.position, "absolute");
  assert.equal(pinLayer.style.transform, image.style.transform);
  assert.equal(pinLayer.style.transformOrigin, image.style.transformOrigin);
  assert.deepEqual(
    [...root.querySelectorAll(".id-overlay-pin")].map((pin) => ({
      text: pin.textContent,
      position: pin.style.position,
      left: pin.style.left,
      top: pin.style.top,
      width: pin.style.width,
      height: pin.style.height,
    })),
    [{
      text: "2",
      position: "absolute",
      left: "40px",
      top: "50px",
      width: "14px",
      height: "14px",
    }],
  );
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "legacy-overlay-chrome",
    terminal: "render-result",
  }));
});
