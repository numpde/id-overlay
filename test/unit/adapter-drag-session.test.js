import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import { createAdapterDragSessionController } from "../../src/content/interactions/adapter-drag-session.js";

test("adapter drag session controller begins only the session matching the requested drag mode", () => {
  const mapSession = createSessionDouble({
    dragMode: DRAG_MODE.MAP_PAN,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MAP_PAN,
  });
  const overlaySession = createSessionDouble({
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MOVE_OVERLAY,
  });
  const controller = createAdapterDragSessionController({
    sessions: [mapSession, overlaySession],
  });

  assert.equal(controller.begin({
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  }), true);

  assert.equal(controller.hasActive(), true);
  assert.equal(controller.getActiveDragMode(), DRAG_MODE.MOVE_OVERLAY);
  assert.deepEqual(overlaySession.calls, [
    ["begin", { x: 10, y: 20 }],
  ]);
  assert.deepEqual(mapSession.calls, [
    ["clear"],
  ]);
});

test("adapter drag session controller rejects non-primary buttons and unknown drag modes", () => {
  const session = createSessionDouble({
    dragMode: DRAG_MODE.MAP_PAN,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MAP_PAN,
  });
  const controller = createAdapterDragSessionController({
    sessions: [session],
  });

  assert.equal(controller.begin({
    button: 1,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MAP_PAN,
  }), false);
  assert.equal(controller.begin({
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: "unknown",
  }), false);

  assert.equal(controller.hasActive(), false);
  assert.deepEqual(session.calls, []);
});

test("adapter drag session controller moves and ends the active session with commit semantics", () => {
  const session = createSessionDouble({
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MOVE_OVERLAY,
  });
  const controller = createAdapterDragSessionController({
    sessions: [session],
  });

  controller.begin({
    button: 0,
    screenPoint: { x: 1, y: 2 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });
  controller.move({ x: 3, y: 4 });

  assert.equal(controller.end({ x: 5, y: 6 }), true);
  assert.equal(controller.hasActive(), false);
  assert.equal(controller.getActiveDragMode(), null);
  assert.deepEqual(session.calls, [
    ["begin", { x: 1, y: 2 }],
    ["move", { x: 3, y: 4 }],
    ["move", { x: 5, y: 6 }],
    ["finish", { x: 5, y: 6 }, { commitPlacement: true }],
  ]);
});

test("adapter drag session controller cancels the active session with caller commit semantics", () => {
  const session = createSessionDouble({
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MOVE_OVERLAY,
  });
  const controller = createAdapterDragSessionController({
    sessions: [session],
  });

  controller.begin({
    button: 0,
    screenPoint: { x: 1, y: 2 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });
  controller.cancel({ x: 7, y: 8 }, { commitPlacement: false });

  assert.equal(controller.hasActive(), false);
  assert.deepEqual(session.calls, [
    ["begin", { x: 1, y: 2 }],
    ["finish", { x: 7, y: 8 }, { commitPlacement: false }],
  ]);
});

test("adapter drag session controller clears all sessions", () => {
  const mapSession = createSessionDouble({
    dragMode: DRAG_MODE.MAP_PAN,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MAP_PAN,
  });
  const overlaySession = createSessionDouble({
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MOVE_OVERLAY,
  });
  const controller = createAdapterDragSessionController({
    sessions: [mapSession, overlaySession],
  });

  controller.begin({
    button: 0,
    screenPoint: { x: 1, y: 2 },
    dragMode: DRAG_MODE.MAP_PAN,
  });
  controller.clear();

  assert.equal(controller.hasActive(), false);
  assert.deepEqual(mapSession.calls, [
    ["begin", { x: 1, y: 2 }],
    ["clear"],
  ]);
  assert.deepEqual(overlaySession.calls, [
    ["clear"],
    ["clear"],
  ]);
});

function createSessionDouble({
  dragMode,
  acceptsDragMode,
}) {
  const calls = [];
  return {
    dragMode,
    calls,
    acceptsDragMode,
    begin(screenPoint) {
      calls.push(["begin", screenPoint]);
      return true;
    },
    move(screenPoint) {
      calls.push(["move", screenPoint]);
    },
    finish(screenPoint, options) {
      calls.push(["finish", screenPoint, options]);
    },
    clear() {
      calls.push(["clear"]);
    },
  };
}
