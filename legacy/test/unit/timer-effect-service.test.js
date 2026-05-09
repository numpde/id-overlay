import test from "node:test";
import assert from "node:assert/strict";

import { createContentTimerEffectService } from "../../src/content/timer-effect-service.js";

test("content timer effect service adapts browser timers to machine timeout ports", () => {
  const timers = createTimerHarness();
  const service = createContentTimerEffectService({ timers });
  const panelCallback = () => {};
  const statusCallback = () => {};

  const panelHandle = service.setPanelTimeout(panelCallback, { delayMs: 100 });
  const statusHandle = service.setStatusTimeout(statusCallback, { delayMs: 200 });

  service.clearPanelTimeout(panelHandle);
  service.clearStatusTimeout(statusHandle);

  assert.deepEqual(timers.setCalls, [
    { callback: panelCallback, delayMs: 100 },
    { callback: statusCallback, delayMs: 200 },
  ]);
  assert.deepEqual(timers.clearCalls, [panelHandle, statusHandle]);
});

function createTimerHarness() {
  const setCalls = [];
  const clearCalls = [];
  return {
    setCalls,
    clearCalls,
    setTimeout(callback, delayMs) {
      const handle = { id: setCalls.length + 1 };
      setCalls.push({ callback, delayMs });
      return handle;
    },
    clearTimeout(handle) {
      clearCalls.push(handle);
    },
  };
}
