import test from "node:test";
import assert from "node:assert/strict";

import { createDraggableSurface } from "../../src/content/draggable-surface.js";
import { createDomEnvironment } from "../helpers/dom-env.js";
import {
  createPointerEvent,
  installPointerEvents,
  removePointerEvents,
} from "../helpers/pointer-events.js";

test("draggable surface owns a pointer drag lifecycle", () => {
  const env = createDomEnvironment();
  try {
    installPointerEvents(env.window);
    const handle = env.document.createElement("div");
    env.document.body.append(handle);
    const calls = [];
    const surface = createDraggableSurface({
      handle,
      ownerWindow: env.window,
      onStart: (event) => calls.push(["start", event.clientX, event.clientY]),
      onMove: (event) => calls.push(["move", event.clientX, event.clientY]),
      onEnd: (event) => calls.push(["end", event.clientX, event.clientY]),
    });

    const startEvent = createPointerEvent(env.window, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 20,
    });
    handle.dispatchEvent(startEvent);
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove", {
      clientX: 30,
      clientY: 40,
    }));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointerup", {
      clientX: 50,
      clientY: 60,
    }));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove", {
      clientX: 70,
      clientY: 80,
    }));

    assert.equal(startEvent.defaultPrevented, true);
    assert.deepEqual(calls, [
      ["start", 10, 20],
      ["move", 30, 40],
      ["end", 50, 60],
    ]);
    surface.destroy();
  } finally {
    env.cleanup();
  }
});

test("draggable surface ignores non-primary and rejected starts", () => {
  const env = createDomEnvironment();
  try {
    installPointerEvents(env.window);
    const handle = env.document.createElement("div");
    env.document.body.append(handle);
    const calls = [];
    const surface = createDraggableSurface({
      handle,
      ownerWindow: env.window,
      shouldStart: () => false,
      onStart: () => calls.push("start"),
      onMove: () => calls.push("move"),
      onEnd: () => calls.push("end"),
    });

    handle.dispatchEvent(createPointerEvent(env.window, "pointerdown", { button: 2 }));
    handle.dispatchEvent(createPointerEvent(env.window, "pointerdown", { button: 0 }));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove"));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointerup"));

    assert.deepEqual(calls, []);
    surface.destroy();
  } finally {
    env.cleanup();
  }
});

test("draggable surface destroy ends the active drag and removes listeners", () => {
  const env = createDomEnvironment();
  try {
    installPointerEvents(env.window);
    const handle = env.document.createElement("div");
    env.document.body.append(handle);
    const calls = [];
    const surface = createDraggableSurface({
      handle,
      ownerWindow: env.window,
      onStart: () => calls.push("start"),
      onMove: () => calls.push("move"),
      onEnd: (event) => calls.push(event ? "end" : "destroy"),
    });

    handle.dispatchEvent(createPointerEvent(env.window, "pointerdown", { button: 0 }));
    surface.destroy();
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove"));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointerup"));

    assert.deepEqual(calls, ["start", "destroy"]);
  } finally {
    env.cleanup();
  }
});

test("draggable surface falls back to mouse events without PointerEvent", () => {
  const env = createDomEnvironment();
  try {
    removePointerEvents(env.window);
    const handle = env.document.createElement("div");
    env.document.body.append(handle);
    const calls = [];
    const surface = createDraggableSurface({
      handle,
      ownerWindow: env.window,
      onStart: (event) => calls.push(["start", event.clientX]),
      onMove: (event) => calls.push(["move", event.clientX]),
      onEnd: (event) => calls.push(["end", event.clientX]),
    });

    handle.dispatchEvent(new env.window.MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 10,
    }));
    env.window.dispatchEvent(new env.window.MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
    }));
    env.window.dispatchEvent(new env.window.MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX: 30,
    }));

    assert.deepEqual(calls, [
      ["start", 10],
      ["move", 20],
      ["end", 30],
    ]);
    surface.destroy();
  } finally {
    env.cleanup();
  }
});
