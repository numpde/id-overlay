import test from "node:test";
import assert from "node:assert/strict";

import {
  createTimerPortAdapter,
} from "../../../adapters/web/timer-port.js";

// Unclassified candidate: timer handles stay inside the adapter. The only fact
// that crosses back inward is the original request identity.
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
