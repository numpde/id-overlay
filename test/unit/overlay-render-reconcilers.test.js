import test from "node:test";
import assert from "node:assert/strict";

import {
  createImageFrameReconciler,
  createPinLayerReconciler,
  createViewportReconciler,
} from "../../src/content/overlay/render-reconcilers.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("viewport reconciler patches only viewport and live map-layer presentation", () => {
  const env = createDomEnvironment();
  try {
    const root = env.document.createElement("div");
    const mapLayer = env.document.createElement("div");
    const reconcileViewport = createViewportReconciler({ root, mapLayer });

    reconcileViewport({
      viewport: {
        mode: "align",
        isPassThrough: false,
        rect: { left: 10, top: 20, width: 300, height: 200 },
      },
      mapLayer: {
        transformOriginCss: "4px 5px",
        transformCss: "matrix(1, 0, 0, 1, 7, 8)",
      },
    });

    assert.equal(root.dataset.mode, "align");
    assert.equal(root.dataset.passThrough, "false");
    assert.equal(root.style.left, "10px");
    assert.equal(root.style.top, "20px");
    assert.equal(root.style.width, "300px");
    assert.equal(root.style.height, "200px");
    assert.equal(mapLayer.style.transformOrigin, "4px 5px");
    assert.equal(mapLayer.style.transform, "matrix(1, 0, 0, 1, 7, 8)");
  } finally {
    env.cleanup();
  }
});

test("image-frame reconciler owns visible image/frame placement and empty cleanup", () => {
  const env = createDomEnvironment();
  try {
    const imageElement = env.document.createElement("img");
    const frameElement = env.document.createElement("div");
    const reconcileImageFrame = createImageFrameReconciler({ imageElement, frameElement });

    reconcileImageFrame({
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
    });

    assert.equal(imageElement.style.display, "block");
    assert.equal(frameElement.style.display, "block");
    assert.equal(imageElement.getAttribute("src"), "https://example.test/reference.png");
    assert.equal(imageElement.style.left, "11px");
    assert.equal(imageElement.style.top, "12px");
    assert.equal(imageElement.style.width, "100px");
    assert.equal(imageElement.style.height, "80px");
    assert.equal(imageElement.style.opacity, "0.5");
    assert.equal(imageElement.style.transformOrigin, "0 0");
    assert.equal(imageElement.style.transform, "rotate(15deg)");
    assert.equal(frameElement.style.transform, "rotate(15deg)");
    assert.equal(frameElement.style.pointerEvents, "auto");

    reconcileImageFrame({ image: null, frame: null });

    assert.equal(imageElement.style.display, "none");
    assert.equal(frameElement.style.display, "none");
    assert.equal(imageElement.hasAttribute("src"), false);
  } finally {
    env.cleanup();
  }
});

test("pin-layer reconciler renders map and overlay pin layers from one pin view model", () => {
  const env = createDomEnvironment();
  try {
    const mapPinLayer = env.document.createElement("div");
    const pinLayer = env.document.createElement("div");
    const reconcilePinLayer = createPinLayerReconciler({ mapPinLayer, pinLayer });

    reconcilePinLayer({
      map: [
        { id: 1, left: 20, top: 30 },
      ],
      overlay: [
        { id: 2, left: 40, top: 50 },
        { id: 3, left: 60, top: 70 },
      ],
    });

    assert.deepEqual(
      [...mapPinLayer.children].map((marker) => ({
        className: marker.className,
        pinId: marker.dataset.pinId,
        left: marker.style.left,
        top: marker.style.top,
        text: marker.textContent,
      })),
      [
        {
          className: "id-overlay-map-pin",
          pinId: "1",
          left: "20px",
          top: "30px",
          text: "1",
        },
      ],
    );
    assert.deepEqual(
      [...pinLayer.children].map((marker) => ({
        className: marker.className,
        left: marker.style.left,
        top: marker.style.top,
        text: marker.textContent,
      })),
      [
        {
          className: "id-overlay-pin",
          left: "40px",
          top: "50px",
          text: "2",
        },
        {
          className: "id-overlay-pin",
          left: "60px",
          top: "70px",
          text: "3",
        },
      ],
    );

    reconcilePinLayer({ map: [], overlay: [] });

    assert.equal(mapPinLayer.children.length, 0);
    assert.equal(pinLayer.children.length, 0);
  } finally {
    env.cleanup();
  }
});
