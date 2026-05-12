import test from "node:test";
import assert from "node:assert/strict";

import {
  createTimerPortAdapter,
} from "../../../adapters/web/timer-port.js";

// Class-b, deliberately not class-a: this is a concrete browser-clock adapter.
// The stable boundary is that the adapter never invents timer-fired product
// facts; it only waits and dispatches the exact application command it was
// given by the app/runtime seam.
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

// Class-b: schedule slots are runtime ownership, not product state. Replacing
// the previous clock for the same slot prevents stale callbacks from replaying
// old app commands while leaving request-id staleness checks inside the app.
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
