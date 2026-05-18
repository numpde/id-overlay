import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";
import {
  REGISTRATION_PIN_MARKER_TONE_PRESENTATION,
} from "../../../adapters/ui/registration-pin-marker.js";
import {
  UI_COLOR_TOKEN,
} from "../../../adapters/ui/ui-color-tokens.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const OVERLAY_EDITING_INPUT = Object.freeze({
  kind: "overlay-editing",
  canEditOverlay: true,
  arePinsVisible: true,
  pointerAffordances: {
    default: "native-map-pan",
    shift: "move-overlay",
    ctrl: "scale-overlay",
    alt: "rotate-overlay",
  },
});
const NATIVE_MAP_INPUT = Object.freeze({
  kind: "native-map",
  canEditOverlay: false,
  arePinsVisible: false,
  pointerAffordances: {
    default: "native-map-pass-through",
  },
});

// Class-b: overlay input posture is a view fact, not an adapter default. The
// concrete DOM adapter must fail loudly if its caller forgets whether the
// rendered overlay is editable or native-map pass-through.
test("overlay adapter requires explicit overlay input facts", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter requires explicit overlay input facts",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  assert.throws(
    () => overlay.render({
      visible: false,
    }),
    /overlayInput is required/u,
  );
  renderOverlay(overlay, {
    visible: false,
  });
  assert.throws(
    () => overlay.update({
      visible: false,
    }),
    /overlayInput is required/u,
  );
  trace.edge(flowEdge("view.overlay-render-facts", "sink.adapter-contract", {
    phase: "missing-overlay-input",
    terminal: "contract-error",
  }));
});

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

  const root = renderOverlay(overlay, {
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

// Class-b: the view model names semantic pointer affordances, and the DOM
// adapter owns the concrete cursor mapping. Align plain hover advertises native
// map pan, Shift hover advertises overlay movement, and an active plain pan
// switches to the browser's grabbing cursor until the sequence ends.
test("overlay adapter maps semantic pointer affordances to cursors", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter maps semantic pointer affordances to cursors",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = renderOverlay(overlay, visibleOverlay());
  overlay.bindInput(root);
  const image = root.querySelector("[data-overlay-image]");
  const frame = root.querySelector(".id-overlay-frame");

  assert.equal(image.style.cursor, "grab");
  assert.equal(frame.style.cursor, "grab");

  window.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "Shift",
    shiftKey: true,
  }));
  assert.equal(image.style.cursor, "move");
  assert.equal(frame.style.cursor, "move");
  assert.equal(overlay.update(visibleOverlay({
    opacity: 0.6,
  }), OVERLAY_EDITING_INPUT), true);
  assert.equal(image.style.cursor, "move");
  assert.equal(frame.style.cursor, "move");

  window.dispatchEvent(new window.KeyboardEvent("keyup", {
    key: "Shift",
    shiftKey: false,
  }));
  assert.equal(image.style.cursor, "grab");
  assert.equal(frame.style.cursor, "grab");

  window.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "Control",
    ctrlKey: true,
  }));
  assert.match(image.style.cursor, /^url\("data:image\/svg\+xml,/u);
  assert.match(image.style.cursor, /nwse-resize$/u);
  assert.equal(frame.style.cursor, image.style.cursor);

  window.dispatchEvent(new window.KeyboardEvent("keyup", {
    key: "Control",
    ctrlKey: false,
  }));
  assert.equal(image.style.cursor, "grab");
  assert.equal(frame.style.cursor, "grab");

  window.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "Alt",
    altKey: true,
  }));
  assert.match(image.style.cursor, /^url\("data:image\/svg\+xml,/u);
  assert.match(image.style.cursor, /alias$/u);
  assert.equal(frame.style.cursor, image.style.cursor);

  window.dispatchEvent(new window.KeyboardEvent("keyup", {
    key: "Alt",
    altKey: false,
  }));
  assert.equal(image.style.cursor, "grab");
  assert.equal(frame.style.cursor, "grab");

  image.dispatchEvent(new window.MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 10,
    clientY: 20,
  }));
  assert.equal(image.style.cursor, "grabbing");
  assert.equal(frame.style.cursor, "grabbing");
  assert.equal(overlay.update(visibleOverlay({
    opacity: 0.7,
  }), OVERLAY_EDITING_INPUT), true);
  assert.equal(image.style.cursor, "grabbing");
  assert.equal(frame.style.cursor, "grabbing");

  window.dispatchEvent(new window.MouseEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 10,
    clientY: 20,
  }));
  assert.equal(image.style.cursor, "grab");
  assert.equal(frame.style.cursor, "grab");

  window.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "Shift",
    shiftKey: true,
  }));
  window.dispatchEvent(new window.Event("blur"));
  assert.equal(image.style.cursor, "grab");
  assert.equal(frame.style.cursor, "grab");
  trace.edge(flowEdge("view.overlay-pointer-affordances", "sink.rendered-overlay", {
    phase: "cursor-mapping",
    terminal: "render-result",
  }));
});

// Class-b: the focused keyboard source may be outside the overlay host window,
// for example OSM's embedded iD frame. Modifier affordances must update from
// explicit host-supplied key event targets, not only after the next pointermove
// happens to carry modifier state.
test("overlay adapter updates modifier cursor from supplied keyboard targets", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter updates modifier cursor from supplied keyboard targets",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const frameDom = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
    readModifierKeyEventTargets() {
      return [
        frameDom.window,
        frameDom.window.document,
      ];
    },
  });

  const root = renderOverlay(overlay, visibleOverlay());
  overlay.bindInput(root);
  const image = root.querySelector("[data-overlay-image]");
  const frame = root.querySelector(".id-overlay-frame");

  assert.equal(image.style.cursor, "grab");
  frameDom.window.document.dispatchEvent(new frameDom.window.KeyboardEvent("keydown", {
    key: "Shift",
    shiftKey: true,
  }));
  assert.equal(image.style.cursor, "move");
  assert.equal(frame.style.cursor, "move");

  frameDom.window.dispatchEvent(new frameDom.window.KeyboardEvent("keyup", {
    key: "Shift",
    shiftKey: false,
  }));
  assert.equal(image.style.cursor, "grab");
  assert.equal(frame.style.cursor, "grab");

  trace.edge(flowEdge("source.embedded-keyboard.shift", "sink.rendered-overlay.cursor", {
    phase: "modifier-cursor",
    terminal: "render-result",
  }));
});

// Class-b: embedded editor frames are discovered opportunistically. If the
// keyboard source appears after the overlay has already been bound, the next
// overlay refresh must resubscribe modifier listeners without replacing the
// overlay DOM or waiting for pointer movement.
test("overlay adapter resubscribes modifier cursor targets on refresh", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter resubscribes modifier cursor targets on refresh",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const frameDom = new JSDOM("<!doctype html><body></body>");
  let modifierTargets = [];
  const overlay = createOverlayAdapter({
    document: window.document,
    readModifierKeyEventTargets() {
      return modifierTargets;
    },
  });

  const root = renderOverlay(overlay, visibleOverlay());
  overlay.bindInput(root);
  const image = root.querySelector("[data-overlay-image]");

  frameDom.window.dispatchEvent(new frameDom.window.KeyboardEvent("keydown", {
    key: "Shift",
    shiftKey: true,
  }));
  assert.equal(image.style.cursor, "grab");

  modifierTargets = [frameDom.window];
  assert.equal(overlay.update(visibleOverlay({
    opacity: 0.8,
  }), OVERLAY_EDITING_INPUT), true);
  frameDom.window.dispatchEvent(new frameDom.window.KeyboardEvent("keydown", {
    key: "Shift",
    shiftKey: true,
  }));
  assert.equal(image.style.cursor, "move");

  trace.edge(flowEdge("source.late-embedded-keyboard.shift", "sink.rendered-overlay.cursor", {
    phase: "modifier-cursor-resubscribe",
    terminal: "render-result",
  }));
});

// Class-b: Trace/pass-through posture belongs to the native browser/map below
// the overlay. The adapter should not supply an overlay cursor when the image
// is not a hit-test target.
test("overlay adapter leaves pass-through posture cursor to the native map", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter leaves pass-through posture cursor to the native map",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render(visibleOverlay(), NATIVE_MAP_INPUT);
  const image = root.querySelector("[data-overlay-image]");
  const frame = root.querySelector(".id-overlay-frame");
  assert.equal(image.style.pointerEvents, "none");
  assert.equal(frame.style.pointerEvents, "none");
  assert.equal(image.style.cursor, "");
  assert.equal(frame.style.cursor, "");
  trace.edge(flowEdge("view.overlay-pointer-affordances", "sink.native-browser-hit-testing", {
    phase: "pass-through-cursor",
    terminal: "pass-through",
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

  const root = renderOverlay(overlay, {
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

// Class-b: display image URLs are browser-resource facts, not CSS fragments.
// The adapter owns CSS serialization for the rendered background image so
// resource URLs with CSS-significant characters cannot break create or patch
// rendering paths.
test("overlay adapter serializes display image URLs as CSS URL values", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter serializes display image URLs as CSS URL values",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = renderOverlay(overlay, overlayWithDisplayUrl({
    displayImageUrl: "blob:https://example.test/ref\"one",
  }));
  const image = root.querySelector("[data-overlay-image]");
  assert.equal(image.style.backgroundImage, 'url("blob:https://example.test/ref\\"one")');

  assert.equal(updateOverlay(overlay, overlayWithDisplayUrl({
    displayImageUrl: "blob:https://example.test/ref\\two",
  })), true);

  assert.equal(image.style.backgroundImage, 'url("blob:https://example.test/ref\\\\two")');
  trace.edge(flowEdge("view.overlay-display-resource-url", "sink.rendered-overlay", {
    phase: "css-url-serialized",
    terminal: "render-result",
  }));
});

// Class-b: legacy renders a separate thin frame around the reference image.
// The frame is visible chrome, not input state: it must track the same rendered
// box as the image whether or not the image is currently interactive. Its color
// follows the same mode token as the panel toggle so the overlay mode is visible
// near the image, not only in the panel.
test("overlay adapter draws a thin mode-colored frame around the reference image", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter draws a thin mode-colored frame around the reference image",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = renderOverlay(overlay, {
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
  assert.equal(frame.style.borderWidth, "1px");
  assert.equal(frame.style.borderStyle, "solid");
  assert.equal(frame.style.borderColor, UI_COLOR_TOKEN.align);
  assert.equal(frame.style.boxShadow, "inset 0 0 0 1px rgba(255, 255, 255, 0.36)");
  assert.equal(frame.style.boxSizing, "border-box");
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "mode-colored-reference-frame",
    terminal: "render-result",
  }));
});

// Class-b: visual mode is separate from pointer posture. Align can temporarily
// pass through to the native map, but the boundary should still match the Align
// toggle color until the actual mode changes to Trace.
test("overlay adapter frame color follows visual mode rather than hit-testing posture", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter frame color follows visual mode rather than hit-testing posture",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });
  const overlayView = {
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
  };
  const nativeMapInput = {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    reason: "temporary-native-map-access",
  };

  const root = overlay.render(overlayView, nativeMapInput, {
    mode: "align",
  });
  const frame = root.querySelector(".id-overlay-frame");
  assert.equal(frame.style.borderColor, UI_COLOR_TOKEN.align);

  assert.equal(overlay.update(overlayView, nativeMapInput, {
    mode: "trace",
  }), true);
  assert.equal(frame.style.borderColor, UI_COLOR_TOKEN.trace);
  trace.edge(flowEdge("view.overlay-visual-mode", "sink.rendered-overlay", {
    phase: "toggle-color-boundary",
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

  const root = renderOverlay(overlay, {
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
      transformCss: "matrix(2, 0, 0, 2, 7, 8)",
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
  assert.equal(root.style.position, "fixed");
  assert.equal(root.style.overflow, "hidden");
  assert.equal(root.style.pointerEvents, "none");
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
  assert.equal(mapLayer.style.transform, "matrix(2, 0, 0, 2, 7, 8)");

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
    [...root.querySelectorAll(".id-overlay-map-pin")].map((anchor) => ({
      id: anchor.dataset.pinId,
      position: anchor.style.position,
      left: anchor.style.left,
      top: anchor.style.top,
      width: anchor.style.width,
      height: anchor.style.height,
      marker: markerSummary(anchor.querySelector(".id-overlay-map-pin__marker")),
    })),
    [{
      id: "1",
      position: "absolute",
      left: "20px",
      top: "30px",
      width: "0px",
      height: "0px",
      marker: {
        text: "1",
        position: "absolute",
        width: "42px",
        height: "42px",
        marginLeft: "-21px",
        marginTop: "-21px",
        fontSize: "30px",
        lineHeight: "30px",
        background: REGISTRATION_PIN_MARKER_TONE_PRESENTATION.normal.background,
        opacity: "0.55",
        transform: "",
        transformOrigin: "50% 50%",
      },
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
      marginLeft: pin.style.marginLeft,
      marginTop: pin.style.marginTop,
      fontSize: pin.style.fontSize,
      lineHeight: pin.style.lineHeight,
      background: pin.style.background,
      opacity: pin.style.opacity,
      transform: pin.style.transform,
    })),
    [{
      text: "2",
      position: "absolute",
      left: "40px",
      top: "50px",
      width: "42px",
      height: "42px",
      marginLeft: "-21px",
      marginTop: "-21px",
      fontSize: "30px",
      lineHeight: "30px",
      background: REGISTRATION_PIN_MARKER_TONE_PRESENTATION.normal.background,
      opacity: "1",
      transform: "",
    }],
  );
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "legacy-overlay-chrome",
    terminal: "render-result",
  }));
});

// Class-b: map-location pins are the same registration markers rendered in map
// coordinates. Their anchors remain in map coordinates, but their marker glyphs
// scale with the current overlay placement so they visually match image pins.
test("overlay adapter patch keeps map pin markers scaling with overlay placement", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter patch keeps map pin markers scaling with overlay placement",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });
  const root = renderOverlay(overlay, overlayWithMapPin({
    transformCss: "matrix(1, 0, 0, 1, 0, 0)",
  }));
  const anchor = root.querySelector(".id-overlay-map-pin");
  const marker = root.querySelector(".id-overlay-map-pin__marker");

  assert.equal(marker.style.transform, "");
  assert.equal(updateOverlay(overlay, overlayWithMapPin({
    transformCss: "matrix(2, 0, 0, 2, 7, 8)",
    placementScale: 0.5,
  })), true);

  assert.equal(root.querySelector(".id-overlay-map-pin"), anchor);
  assert.equal(root.querySelector(".id-overlay-map-pin__marker"), marker);
  assert.equal(root.querySelector(".id-overlay-map-layer").style.transform, "matrix(2, 0, 0, 2, 7, 8)");
  assert.equal(anchor.style.left, "20px");
  assert.equal(anchor.style.top, "30px");
  assert.equal(marker.style.transform, "scale(0.5)");
  assert.equal(marker.style.transformOrigin, "50% 50%");
  assert.equal(updateOverlay(overlay, overlayWithMapPin({
    transformCss: "matrix(2, 0, 0, 2, 7, 8)",
    placementScale: 0,
  })), true);
  assert.equal(marker.style.transform, "");
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "patched-map-pin-overlay-placement-scale",
    terminal: "render-result",
  }));
});

// Class-b: explicit image/frame boxes are already rendered coordinates. Map
// pin markers should not inherit stale inline placement scale when overlay pins
// are rendered inside an explicit placement box.
test("overlay adapter leaves map pin markers unscaled for explicit image boxes", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter leaves map pin markers unscaled for explicit image boxes",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = renderOverlay(overlay, {
    ...overlayWithMapPin({
      transformCss: "matrix(1, 0, 0, 1, 0, 0)",
      placementScale: 0.25,
    }),
    image: {
      src: "https://example.test/reference.png",
      left: 11,
      top: 12,
      width: 100,
      height: 80,
      rotationDeg: 0,
      opacity: 0.5,
    },
    frame: {
      left: 11,
      top: 12,
      width: 100,
      height: 80,
      rotationDeg: 0,
      ownsPointerHitTesting: true,
    },
  });

  assert.equal(root.querySelector(".id-overlay-pin-layer").style.transform, "rotate(0deg)");
  assert.equal(root.querySelector(".id-overlay-map-pin__marker").style.transform, "");
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "explicit-box-map-pin-marker-scale",
    terminal: "render-result",
  }));
});

// Class-b: overlay input ownership is a lifecycle boundary. Surface listeners
// must move when a new surface is bound and be released with the adapter so
// stale DOM from a replaced render cannot keep emitting interaction facts.
test("overlay adapter input listeners follow the owned surface lifecycle", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter input listeners follow the owned surface lifecycle",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const emitted = [];
  const overlay = createOverlayAdapter({
    document: window.document,
    emitInteractionFact: (fact) => emitted.push(fact),
  });
  const surface = renderOverlay(overlay, overlayWithMapPin({
    transformCss: "matrix(1, 0, 0, 1, 0, 0)",
  }));
  overlay.bindInput(surface);

  surface.dispatchEvent(new window.MouseEvent("dblclick", {
    bubbles: true,
    cancelable: true,
    clientX: 11,
    clientY: 12,
  }));
  assert.equal(emitted.length, 1);

  const nextSurface = renderOverlay(overlay, overlayWithMapPin({
    transformCss: "matrix(1, 0, 0, 1, 1, 2)",
  }));
  overlay.bindInput(nextSurface);
  surface.dispatchEvent(new window.MouseEvent("dblclick", {
    bubbles: true,
    cancelable: true,
    clientX: 13,
    clientY: 14,
  }));
  assert.equal(emitted.length, 1);
  nextSurface.dispatchEvent(new window.MouseEvent("dblclick", {
    bubbles: true,
    cancelable: true,
    clientX: 15,
    clientY: 16,
  }));
  assert.equal(emitted.length, 2);

  overlay.destroy();
  nextSurface.dispatchEvent(new window.MouseEvent("dblclick", {
    bubbles: true,
    cancelable: true,
    clientX: 17,
    clientY: 18,
  }));
  assert.equal(emitted.length, 2);
  trace.edge(flowEdge("source.dom-overlay-input", "sink.interaction-facts", {
    phase: "surface-listeners-are-owned",
    terminal: "no-stale-emission",
  }));
});

// Class-b: adapters render the pin tone selected by the view model. Blue is the
// normal registration marker; danger/red means the pin set has already been
// classified as an impossible transform upstream.
test("overlay adapter renders dangerous registration pins red", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter renders dangerous registration pins red",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = renderOverlay(overlay, {
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
    mapPins: [{
      id: 1,
      left: 20,
      top: 30,
      tone: "danger",
    }],
    pins: [{
      id: 2,
      tone: "danger",
      imagePx: {
        x: 320,
        y: 240,
      },
    }],
  });

  assert.equal(
    root.querySelector(".id-overlay-map-pin__marker").style.background,
    REGISTRATION_PIN_MARKER_TONE_PRESENTATION.danger.background,
  );
  assert.equal(root.querySelector(".id-overlay-map-pin__marker").dataset.pinTone, "danger");
  assert.equal(
    root.querySelector(".id-overlay-pin").style.background,
    REGISTRATION_PIN_MARKER_TONE_PRESENTATION.danger.background,
  );
  assert.equal(root.querySelector(".id-overlay-pin").dataset.pinTone, "danger");
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "danger-pin-tone",
    terminal: "render-result",
  }));
});

// Class-b: marker text is user-facing and should come from view-model labels.
// Durable ids still remain on data attributes for hit testing and removal, but
// gaps in durable ids must not appear as visible pin numbers.
test("overlay adapter renders registration pin labels without replacing durable ids", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay adapter renders registration pin labels without replacing durable ids",
  });
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = renderOverlay(overlay, {
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
      id: 5,
      label: "3",
      imagePx: {
        x: 320,
        y: 240,
      },
    }],
    mapPins: [{
      id: 6,
      label: "4",
      left: 20,
      top: 30,
    }],
  });

  assert.equal(root.querySelector(".id-overlay-pin").dataset.pinId, "5");
  assert.equal(root.querySelector(".id-overlay-pin").textContent, "3");
  assert.equal(root.querySelector(".id-overlay-map-pin").dataset.pinId, "6");
  assert.equal(root.querySelector(".id-overlay-map-pin").textContent, "4");
  trace.edge(flowEdge("view.overlay-render-facts", "sink.rendered-overlay", {
    phase: "pin-labels",
    terminal: "render-result",
  }));
});

function markerSummary(marker) {
  return {
    text: marker.textContent,
    position: marker.style.position,
    width: marker.style.width,
    height: marker.style.height,
    marginLeft: marker.style.marginLeft,
    marginTop: marker.style.marginTop,
    fontSize: marker.style.fontSize,
    lineHeight: marker.style.lineHeight,
    background: marker.style.background,
    opacity: marker.style.opacity,
    transform: marker.style.transform,
    transformOrigin: marker.style.transformOrigin,
  };
}

function renderOverlay(overlay, overlayView) {
  return overlay.render(overlayView, OVERLAY_EDITING_INPUT);
}

function updateOverlay(overlay, overlayView) {
  return overlay.update(overlayView, OVERLAY_EDITING_INPUT);
}

function visibleOverlay(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function overlayWithMapPin({
  transformCss,
  placementScale = 1,
}) {
  return {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 100,
      height: 80,
    },
    placement: {
      x: 11,
      y: 12,
      scale: placementScale,
      rotationRad: 0,
    },
    opacity: 0.5,
    mapLayer: {
      transformOriginCss: "0px 0px",
      transformCss,
    },
    mapPins: [{
      id: 1,
      left: 20,
      top: 30,
    }],
    pins: [],
  };
}

function overlayWithDisplayUrl({ displayImageUrl }) {
  return {
    visible: true,
    imageDataRef: "reference-image-data-1",
    displayImageUrl,
    intrinsicSizePx: {
      width: 100,
      height: 80,
    },
    placement: {
      x: 11,
      y: 12,
      scale: 1,
      rotationRad: 0,
    },
    opacity: 0.5,
    pins: [],
  };
}
