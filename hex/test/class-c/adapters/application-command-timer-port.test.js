import test from "node:test";
import assert from "node:assert/strict";

import {
  createTimerPortAdapter,
} from "../../../adapters/web/timer-port.js";

// Class-c: this is the preferred timer-port destination, but it is not yet a
// satisfied contract. Current stable code still exposes `startTimer` returning
// a `timer-fired` fact; this quarantine keeps the no-regret direction visible
// without pretending the cut-over has happened.
//
// Decision: keep, but do not promote. The test is valuable only after the
// application emits scheduled commands and the shell stops translating
// `timer-fired` facts into product meaning.
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

// Class-c: replacement by schedule slot is the clean timer ownership model, but
// the current adapter is keyed by request id. This remains quarantined until the
// effect vocabulary is changed instead of locally adapting this one test.
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
