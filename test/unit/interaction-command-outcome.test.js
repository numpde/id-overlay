import test from "node:test";
import assert from "node:assert/strict";

import {
  applyInteractionCommandOutcome,
} from "../../src/content/interactions/command-outcome.js";

test("handled interaction command outcomes log and observe their pointer", () => {
  const loggerCalls = [];
  const observedPointers = [];

  const handled = applyInteractionCommandOutcome({
    outcome: {
      handled: true,
      pointerScreenPx: { x: 12, y: 34 },
      log: {
        level: "info",
        message: "Handled command",
        details: { command: "test" },
      },
    },
    runtimeBridge: {
      observePointer(screenPoint) {
        observedPointers.push(screenPoint);
      },
    },
    logger: createLogger(loggerCalls),
  });

  assert.equal(handled, true);
  assert.deepEqual(observedPointers, [{ x: 12, y: 34 }]);
  assert.deepEqual(loggerCalls, [
    ["info", "Handled command", { command: "test" }],
  ]);
});

test("unhandled interaction command outcomes log without mutating runtime pointer", () => {
  const loggerCalls = [];
  const observedPointers = [];

  const handled = applyInteractionCommandOutcome({
    outcome: {
      handled: false,
      reason: "not-available",
      log: {
        level: "warn",
        message: "Ignored command",
      },
    },
    runtimeBridge: {
      observePointer(screenPoint) {
        observedPointers.push(screenPoint);
      },
    },
    logger: createLogger(loggerCalls),
  });

  assert.equal(handled, false);
  assert.deepEqual(observedPointers, []);
  assert.deepEqual(loggerCalls, [
    ["warn", "Ignored command"],
  ]);
});

test("interaction command outcomes can be silent", () => {
  const loggerCalls = [];
  const observedPointers = [];

  const handled = applyInteractionCommandOutcome({
    outcome: {
      handled: true,
      pointerScreenPx: { x: 1, y: 2 },
      log: null,
    },
    runtimeBridge: {
      observePointer(screenPoint) {
        observedPointers.push(screenPoint);
      },
    },
    logger: createLogger(loggerCalls),
  });

  assert.equal(handled, true);
  assert.deepEqual(observedPointers, [{ x: 1, y: 2 }]);
  assert.deepEqual(loggerCalls, []);
});

function createLogger(calls) {
  return {
    info(...args) {
      calls.push(["info", ...args]);
    },
    warn(...args) {
      calls.push(["warn", ...args]);
    },
  };
}
