import test from "node:test";
import assert from "node:assert/strict";

import {
  createTimerPortAdapter,
} from "../../../adapters/web/timer-port.js";

// Class-b, deliberately not class-a: timer handles are runtime capabilities,
// not application data. The app-facing fact preserves only the request identity
// and timer purpose needed for the application to decide staleness.
test("timer port preserves request identity", async () => {
  const scheduled = [];
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

  const fired = timerPort.startTimer({
    requestId: "status-1",
    delayMs: 2500,
    purpose: "clear-status-notice",
  });
  scheduled[0].callback();

  assert.equal(scheduled[0].delayMs, 2500);
  assert.deepEqual(await fired, {
    kind: "timer-fired",
    requestId: "status-1",
    purpose: "clear-status-notice",
  });
});
