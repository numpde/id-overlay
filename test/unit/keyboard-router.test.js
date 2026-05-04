import test from "node:test";
import assert from "node:assert/strict";

import { MACHINE_INPUT_OVERRIDE } from "../../src/core/machine/events.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import { SESSION_MODE, createEmptySession } from "../../src/core/session.js";
import { createKeyboardInputRouter } from "../../src/content/interactions/keyboard-router.js";

const TEST_IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

test("keyboard router consumes pin shortcut and delegates current-pointer toggle", () => {
  const harness = createKeyboardRouterHarness();
  const keydown = createKeyEvent({ code: "KeyP" });

  harness.keyTarget.dispatch("keydown", keydown);

  assert.deepEqual(harness.calls.pinToggles, [{ x: 600, y: 320 }]);
  assert.equal(keydown.prevented, true);
  assert.equal(keydown.stopped, true);
  assert.equal(keydown.immediatelyStopped, true);

  harness.router.destroy();
});

test("keyboard router switches Escape to Trace through the supplied command", () => {
  const harness = createKeyboardRouterHarness();
  const keydown = createKeyEvent({ code: "Escape" });

  harness.keyTarget.dispatch("keydown", keydown);

  assert.deepEqual(harness.calls.modes, [SESSION_MODE.TRACE]);
  assert.equal(keydown.prevented, true);

  harness.router.destroy();
});

test("keyboard router activates and releases pass-through", () => {
  const harness = createKeyboardRouterHarness();
  const keydown = createKeyEvent({ code: "Space" });
  const keyup = createKeyEvent({ code: "Space" });

  harness.keyTarget.dispatch("keydown", keydown);
  harness.runtime = {
    ...harness.runtime,
    inputOverride: MACHINE_INPUT_OVERRIDE.PASS_THROUGH,
  };
  harness.keyTarget.dispatch("keyup", keyup);

  assert.deepEqual(harness.calls.passThrough, [true, false]);
  assert.equal(keydown.prevented, true);
  assert.equal(keyup.prevented, true);

  harness.router.destroy();
});

test("keyboard router ignores shortcuts without an image session", () => {
  const harness = createKeyboardRouterHarness({
    session: createEmptySession(),
  });
  const keydown = createKeyEvent({ code: "KeyP" });

  harness.keyTarget.dispatch("keydown", keydown);

  assert.deepEqual(harness.calls.pinToggles, []);
  assert.equal(keydown.prevented, false);

  harness.router.destroy();
});

test("keyboard router resets interaction state on blur", () => {
  const harness = createKeyboardRouterHarness();

  harness.keyTarget.dispatch("blur", {});

  assert.deepEqual(harness.calls.resets, [{
    endPointerScreenPx: { x: 600, y: 320 },
    pointerScreenPx: null,
  }]);

  harness.router.destroy();
});

function createKeyboardRouterHarness({
  session = createEmptySession({
    mode: SESSION_MODE.ALIGN,
    image: TEST_IMAGE,
  }),
  pointerScreenPx = { x: 600, y: 320 },
} = {}) {
  const keyTarget = createKeyTarget();
  const calls = {
    modes: [],
    passThrough: [],
    pinToggles: [],
    resets: [],
  };
  const harness = {
    keyTarget,
    calls,
    runtime: createInitialMachineState().runtime,
    router: null,
  };
  harness.router = createKeyboardInputRouter({
    keyTarget,
    getMachineState: () => ({
      ...createInitialMachineState(),
      session,
      runtime: harness.runtime,
    }),
    getRuntimeState: () => harness.runtime,
    getPointerScreenPx: () => pointerScreenPx,
    executePinToggleAtScreenPoint(screenPoint) {
      calls.pinToggles.push(screenPoint);
      return true;
    },
    applyMode(mode) {
      calls.modes.push(mode);
      return true;
    },
    setPassThrough(isActive) {
      calls.passThrough.push(isActive);
    },
    resetInteractionState(payload) {
      calls.resets.push(payload);
    },
    logger: createLoggerDouble(),
  });
  return harness;
}

function createLoggerDouble() {
  return {
    debug() {},
    info() {},
  };
}

function createKeyTarget() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
    dispatch(type, event) {
      if (!event.composedPath) {
        event.composedPath = () => [];
      }
      listeners.get(type)?.(event);
    },
  };
}

function createKeyEvent(overrides = {}) {
  return {
    code: "",
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    prevented: false,
    stopped: false,
    immediatelyStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    stopImmediatePropagation() {
      this.immediatelyStopped = true;
    },
    composedPath() {
      return [];
    },
    ...overrides,
  };
}
