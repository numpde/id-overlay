import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Unclassified candidate: legacy overlay input owned pending pointer sequences
// at the mount-window boundary, not just at the initial DOM target. When page
// observation remounted the overlay into another document, global move/up
// listeners retargeted to the new window so the active sequence could complete.
// The final API may not be `retargetGlobalPointerListeners`, but the lifecycle
// behavior is worth preserving outside product state.
test("overlay pointer ownership retargets global listeners when the mount window changes", () => {
  const first = new JSDOM("<!doctype html><body><div id='overlay'></div></body>");
  const second = new JSDOM("<!doctype html><body><div id='overlay'></div></body>");
  let activeWindow = first.window;
  const facts = [];
  const overlay = createOverlayAdapter({
    document: first.window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  const binding = overlay.bindInput(first.window.document.getElementById("overlay"), {
    getMountWindow() {
      return activeWindow;
    },
  });

  first.window.document.getElementById("overlay").dispatchEvent(pointerEvent(first.window, "pointerdown", {
    x: 512,
    y: 288,
  }));
  activeWindow = second.window;
  binding.retargetGlobalPointerListeners();
  first.window.dispatchEvent(pointerEvent(first.window, "pointermove", {
    x: 520,
    y: 288,
  }));
  second.window.dispatchEvent(pointerEvent(second.window, "pointermove", {
    x: 520,
    y: 288,
  }));

  assert.deepEqual(facts, [
    {
      kind: "overlay-pointer-down",
      screenPx: {
        x: 512,
        y: 288,
      },
      button: 0,
    },
    {
      kind: "overlay-pointer-move",
      screenPx: {
        x: 520,
        y: 288,
      },
    },
  ]);
});

// Unclassified candidate: destroying the overlay must remove pending global
// listeners. Late pointer events after unmount should not continue a drag,
// request placement edits, or report runtime errors through stale callbacks.
test("overlay pointer ownership destroy removes pending global listeners", () => {
  const { window } = new JSDOM("<!doctype html><body><div id='overlay'></div></body>");
  const facts = [];
  const overlay = createOverlayAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  const binding = overlay.bindInput(window.document.getElementById("overlay"), {
    getMountWindow() {
      return window;
    },
  });

  window.document.getElementById("overlay").dispatchEvent(pointerEvent(window, "pointerdown", {
    x: 512,
    y: 288,
  }));
  binding.destroy();
  window.dispatchEvent(pointerEvent(window, "pointermove", {
    x: 520,
    y: 288,
  }));
  window.dispatchEvent(pointerEvent(window, "pointerup", {
    x: 520,
    y: 288,
  }));

  assert.deepEqual(facts, [{
    kind: "overlay-pointer-down",
    screenPx: {
      x: 512,
      y: 288,
    },
    button: 0,
  }]);
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
