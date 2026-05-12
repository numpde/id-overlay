import test from "node:test";
import assert from "node:assert/strict";

import {
  createTimerPortAdapter,
} from "../../../adapters/web/timer-port.js";

// Unclassified candidate: a timer port is a clock adapter, not product logic.
// It receives an app-supplied schedule slot and an app command, returns
// immediately, and later dispatches that command unchanged.
test("timer port dispatches the scheduled application command unchanged", () => {
  const scheduled = [];
  const dispatched = [];
  const timerPort = createTimerPortAdapter({
    setTimer(delayMs, callback) {
      scheduled.push({
        delayMs,
        callback,
      });
      return {
        runtimeTimerHandle: scheduled.length,
      };
    },
    clearTimer() {},
  });

  timerPort.scheduleApplicationCommand({
    scheduleId: "status-notice",
    delayMs: 2500,
    command: {
      kind: "clear-status-notice",
      requestId: 7,
    },
    dispatchApplicationCommand(command) {
      dispatched.push(command);
    },
  });

  assert.equal(scheduled[0].delayMs, 2500);
  scheduled[0].callback();
  assert.deepEqual(dispatched, [{
    kind: "clear-status-notice",
    requestId: 7,
  }]);
});

// Unclassified candidate: replacement is a clock concern keyed by a
// product-supplied schedule slot. If the app schedules a newer status expiry,
// the port cancels the old clock without knowing what a status notice is.
test("timer port replaces older clock for the same schedule slot", () => {
  const scheduled = [];
  const cleared = [];
  const dispatched = [];
  const timerPort = createTimerPortAdapter({
    setTimer(delayMs, callback) {
      const handle = {
        runtimeTimerHandle: scheduled.length + 1,
      };
      scheduled.push({
        delayMs,
        callback,
        handle,
      });
      return handle;
    },
    clearTimer(handle) {
      cleared.push(handle);
    },
  });

  timerPort.scheduleApplicationCommand({
    scheduleId: "status-notice",
    delayMs: 2500,
    command: {
      kind: "clear-status-notice",
      requestId: 1,
    },
    dispatchApplicationCommand(command) {
      dispatched.push(command);
    },
  });
  timerPort.scheduleApplicationCommand({
    scheduleId: "status-notice",
    delayMs: 2500,
    command: {
      kind: "clear-status-notice",
      requestId: 2,
    },
    dispatchApplicationCommand(command) {
      dispatched.push(command);
    },
  });

  assert.deepEqual(cleared, [scheduled[0].handle]);

  scheduled[0].callback();
  scheduled[1].callback();

  assert.deepEqual(dispatched, [{
    kind: "clear-status-notice",
    requestId: 2,
  }]);
});
