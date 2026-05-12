import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Unclassified: proposal for overlay click/pointer vocabulary. The adapter may
// observe pointer events, but the emitted fact names the product interaction:
// "toggle a registration pin at this screen point".
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

// Unclassified: proposal for drag/move vocabulary. A drag is reduced to one
// placement-edit request with browser-neutral geometry. The application later
// receives only a committed placement, after projection has done the geometry.
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

// Unclassified: proposal for wheel/modifier vocabulary. DOM wheel and modifier
// details terminate in the adapter; downstream code sees semantic placement or
// opacity adjustment requests with a neutral adjustment vector.
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
