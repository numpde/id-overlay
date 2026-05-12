import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-c: this is a proposed canonical interaction vocabulary, not today's
// overlay adapter contract. Current class-b tests allow low-level overlay facts
// while the runtime/projectors translate them; this candidate says the adapter
// should instead emit source-neutral user-intent facts directly.
//
// Decision: keep quarantined. The direction may be right, but it must be
// settled with keyboard/runtime vocabulary as one cut-over; promoting this file
// alone would make overlay semantics disagree with the rest of the input stack.
test("candidate: overlay click emits registration pin-toggle fact", () => {
  const { window, surface, facts } = createOverlayHarness();

  dispatchPointer(window, surface, "pointerdown", {
    clientX: 120,
    clientY: 90,
  });
  dispatchPointer(window, surface, "pointerup", {
    clientX: 120,
    clientY: 90,
  });

  assert.deepEqual(facts, [{
    kind: "registration-pin-toggle-requested",
    screenPx: {
      x: 120,
      y: 90,
    },
  }]);
  assert.equal(JSON.stringify(facts).includes("pointer"), false);
  assert.equal(JSON.stringify(facts).includes("button"), false);
});

// Class-c: drag recognition ownership is still unsettled. This test assumes
// the overlay adapter compresses pointer phases into one placement-edit fact;
// keep it out of stronger classes until that ownership is deliberately chosen.
test("candidate: overlay drag emits move placement-edit fact", () => {
  const { window, surface, facts } = createOverlayHarness();

  dispatchPointer(window, surface, "pointerdown", {
    clientX: 120,
    clientY: 90,
  });
  dispatchPointer(window, surface, "pointermove", {
    clientX: 150,
    clientY: 110,
  });
  dispatchPointer(window, surface, "pointerup", {
    clientX: 150,
    clientY: 110,
  });

  assert.deepEqual(facts, [{
    kind: "placement-edit-requested",
    editKind: "move",
    screenDeltaPx: {
      x: 30,
      y: 20,
    },
    anchorScreenPx: {
      x: 120,
      y: 90,
    },
  }]);
});

// Class-c: wheel/modifier normalization is part of the same unresolved
// interaction vocabulary. The important pressure is no DOM `wheel`/`deltaY`
// vocabulary past the adapter, but current stable tests still document it.
test("candidate: overlay wheel gestures emit placement and opacity facts", () => {
  const { window, surface, facts } = createOverlayHarness();

  dispatchWheel(window, surface, {
    altKey: true,
  });
  dispatchWheel(window, surface, {
    ctrlKey: true,
  });
  dispatchWheel(window, surface, {
    shiftKey: true,
  });

  assert.deepEqual(facts, [
    {
      kind: "opacity-adjustment-requested",
      adjustment: {
        y: -100,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "placement-edit-requested",
      editKind: "rotate",
      adjustment: {
        y: -100,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "placement-edit-requested",
      editKind: "scale",
      adjustment: {
        y: -100,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
  ]);
  assert.equal(JSON.stringify(facts).includes("wheel"), false);
  assert.equal(JSON.stringify(facts).includes("deltaY"), false);
  assert.equal(JSON.stringify(facts).includes("overlay"), false);
});

function createOverlayHarness() {
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
  return {
    window,
    surface,
    facts,
  };
}

function dispatchPointer(window, target, type, options) {
  return target.dispatchEvent(new window.MouseEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  }));
}

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
