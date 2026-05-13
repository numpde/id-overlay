import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayInputHost,
} from "../../../adapters/ui/overlay-input-host.js";

// Class-b, deliberately not class-a: global listener retargeting is browser
// adapter lifecycle, not product law. The stable boundary is that an active
// overlay pointer sequence follows the current mount window and stops listening
// to the previous one.
test("overlay input host retargets global pointer listeners to the active mount window", () => {
  const first = new JSDOM("<!doctype html><body><div id='map-a'></div></body>");
  const second = new JSDOM("<!doctype html><body><div id='map-b'></div></body>");
  let mountElement = first.window.document.getElementById("map-a");
  const moves = [];
  const host = createOverlayInputHost({
    getMountElement: () => mountElement,
    globalPointerHandlers: {
      handleGlobalPointerMove(event) {
        moves.push(event.clientX);
      },
    },
    fallbackWindow: first.window,
  });

  host.syncGlobalPointerListeners(true);
  first.window.dispatchEvent(pointerEvent(first.window, "pointermove", {
    x: 1,
    y: 10,
  }));
  mountElement = second.window.document.getElementById("map-b");
  host.syncGlobalPointerListeners(true);
  first.window.dispatchEvent(pointerEvent(first.window, "pointermove", {
    x: 2,
    y: 20,
  }));
  second.window.dispatchEvent(pointerEvent(second.window, "pointermove", {
    x: 3,
    y: 30,
  }));

  assert.deepEqual(moves, [1, 3]);
});

// Class-b, deliberately not class-a: unmounting the overlay must remove global
// listeners so late browser events cannot continue a stale pointer sequence.
test("overlay input host destroy removes pending global pointer listeners", () => {
  const { window } = new JSDOM("<!doctype html><body><div id='map'></div></body>");
  const moves = [];
  const host = createOverlayInputHost({
    getMountElement: () => window.document.getElementById("map"),
    globalPointerHandlers: {
      handleGlobalPointerMove(event) {
        moves.push(event.clientX);
      },
    },
    fallbackWindow: window,
  });

  host.syncGlobalPointerListeners(true);
  host.destroy();
  window.dispatchEvent(pointerEvent(window, "pointermove", {
    x: 1,
    y: 10,
  }));

  assert.deepEqual(moves, []);
});

function pointerEvent(window, type, { x, y }) {
  return new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
}
