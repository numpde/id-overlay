import test from "node:test";
import assert from "node:assert/strict";

import { createKeyboardGateway } from "../../src/content/keyboard-gateway.js";

test("keyboard gateway forwards captured key and blur events to subscribers", () => {
  const windowTarget = createWindowHarness();
  const gateway = createKeyboardGateway(windowTarget);
  const received = [];

  gateway.subscribe({
    keydown: (event) => received.push(["keydown", event]),
    keyup: (event) => received.push(["keyup", event]),
    blur: (event) => received.push(["blur", event]),
  });
  const keydown = { code: "KeyP" };
  const keyup = { code: "KeyP" };
  const blur = {};
  windowTarget.dispatch("keydown", keydown);
  windowTarget.dispatch("keyup", keyup);
  windowTarget.dispatch("blur", blur);

  assert.deepEqual(received, [
    ["keydown", keydown],
    ["keyup", keyup],
    ["blur", blur],
  ]);
  assert.deepEqual(windowTarget.listenerOptions, [
    ["keydown", true],
    ["keyup", true],
    ["blur", undefined],
  ]);
});

test("keyboard gateway unsubscribe and destroy remove event delivery", () => {
  const windowTarget = createWindowHarness();
  const gateway = createKeyboardGateway(windowTarget);
  const received = [];
  const unsubscribe = gateway.subscribe({
    keydown: (event) => received.push(event),
  });

  windowTarget.dispatch("keydown", { code: "KeyP" });
  unsubscribe();
  windowTarget.dispatch("keydown", { code: "KeyP" });
  gateway.subscribe({
    keydown: (event) => received.push(event),
  });
  gateway.destroy();
  gateway.destroy();
  gateway.subscribe({
    keydown: (event) => received.push(event),
  });
  windowTarget.dispatch("keydown", { code: "KeyP" });

  assert.equal(received.length, 1);
  assert.equal(windowTarget.listenerCount("keydown"), 0);
  assert.equal(windowTarget.listenerCount("keyup"), 0);
  assert.equal(windowTarget.listenerCount("blur"), 0);
});

function createWindowHarness() {
  const listeners = new Map();
  const listenerOptions = [];
  return {
    listenerOptions,
    addEventListener(type, listener, options) {
      listenerOptions.push([type, options]);
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
      );
    },
    listenerCount(type) {
      return listeners.get(type)?.length ?? 0;
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
}
