import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-b, not class-a: DOM tags and data markers are adapter-local test
// handles, but the boundary is stable. The overlay adapter renders from
// application view facts only; it must not receive or inspect session-shaped
// product state.
test("overlay adapter renders from overlay view facts only", () => {
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
});

// Class-b: raw pointer input is adapter-local. The application receives a
// plain interaction fact, not the DOM event.
test("overlay input adapter emits pointer facts only", () => {
  const { window } = new JSDOM("<!doctype html><body><div id='surface'></div></body>");
  const facts = [];
  const overlay = createOverlayAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  const surface = window.document.getElementById("surface");

  overlay.bindInput(surface);
  surface.dispatchEvent(new window.MouseEvent("pointerdown", {
    clientX: 120,
    clientY: 90,
    bubbles: true,
  }));

  assert.deepEqual(facts, [{
    kind: "overlay-pointer-down",
    screenPx: {
      x: 120,
      y: 90,
    },
    button: 0,
  }]);
});

// Class-b: modifier-wheel gestures are overlay editing input in Align posture.
// The UI adapter owns DOM wheel details; the application/runtime should only
// receive plain interaction facts, and the host page should not see handled
// overlay wheel events.
test("overlay input adapter emits contained wheel facts", () => {
  const { window } = new JSDOM("<!doctype html><body><div id='surface'></div></body>");
  const facts = [];
  const bubbledEvents = [];
  const overlay = createOverlayAdapter({
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  const surface = window.document.getElementById("surface");
  window.document.body.addEventListener("wheel", () => {
    bubbledEvents.push("wheel");
  });

  overlay.bindInput(surface);
  const dispatchResults = [
    dispatchWheel(window, surface, { altKey: true }),
    dispatchWheel(window, surface, { ctrlKey: true }),
    dispatchWheel(window, surface, { shiftKey: true }),
  ];

  assert.deepEqual(facts, [
    {
      kind: "overlay-opacity-wheel",
      deltaY: -100,
      screenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "overlay-rotate-wheel",
      deltaY: -100,
      screenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "overlay-scale-wheel",
      deltaY: -100,
      screenPx: {
        x: 120,
        y: 90,
      },
    },
  ]);
  assert.deepEqual(dispatchResults, [false, false, false]);
  assert.deepEqual(bubbledEvents, []);
});

function dispatchWheel(window, target, modifiers) {
  return target.dispatchEvent(new window.WheelEvent("wheel", {
    ...modifiers,
    deltaY: -100,
    clientX: 120,
    clientY: 90,
    bubbles: true,
    cancelable: true,
  }));
}
