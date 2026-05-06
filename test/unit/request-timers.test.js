import test from "node:test";
import assert from "node:assert/strict";

import { createRequestTimerRegistry } from "../../src/core/machine/request-timers.js";

test("request timer registry replaces matching request timers", () => {
  const scheduler = createScheduler();
  const completed = [];
  const timers = createRequestTimerRegistry({
    setTimer: scheduler.set,
    clearTimer: scheduler.clear,
    delayMs: 1800,
    createElapsedResult: ({ requestId }) => ({ kind: "elapsed", requestId }),
    completeElapsed: (result) => completed.push(result),
  });

  timers.start({ requestId: 7, intent: "paste" });
  timers.start({ requestId: 7, intent: "paste" });

  assert.deepEqual(scheduler.cleared, [1]);
  assert.equal(scheduler.pendingCount(), 1);
  assert.deepEqual(scheduler.latestPayload(), {
    requestId: 7,
    intent: "paste",
    delayMs: 1800,
  });

  scheduler.fireLatest();

  assert.deepEqual(completed, [{ kind: "elapsed", requestId: 7 }]);
  assert.equal(scheduler.pendingCount(), 0);
});

test("request timer registry cancels and clears outstanding timers", () => {
  const scheduler = createScheduler();
  const completed = [];
  const timers = createRequestTimerRegistry({
    setTimer: scheduler.set,
    clearTimer: scheduler.clear,
    delayMs: 5,
    createElapsedResult: ({ requestId }) => ({ kind: "elapsed", requestId }),
    completeElapsed: (result) => completed.push(result),
  });

  timers.start({ requestId: 1 });
  timers.start({ requestId: 2 });
  timers.cancel({ requestId: 1 });

  assert.deepEqual(scheduler.cleared, [1]);
  assert.equal(scheduler.pendingCount(), 1);

  timers.clearAll();

  assert.deepEqual(scheduler.cleared, [1, 2]);
  assert.equal(scheduler.pendingCount(), 0);
  assert.deepEqual(completed, []);
});

test("request timer registry is inert without a scheduler", () => {
  const completed = [];
  const timers = createRequestTimerRegistry({
    delayMs: 5,
    createElapsedResult: ({ requestId }) => ({ kind: "elapsed", requestId }),
    completeElapsed: (result) => completed.push(result),
  });

  assert.doesNotThrow(() => {
    timers.start({ requestId: 1 });
    timers.cancel({ requestId: 1 });
    timers.clearAll();
  });
  assert.deepEqual(completed, []);
});

function createScheduler() {
  let nextId = 1;
  const pending = new Map();
  const payloads = new Map();
  const cleared = [];

  return {
    cleared,
    set(callback, payload) {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      payloads.set(id, payload);
      return id;
    },
    clear(id) {
      cleared.push(id);
      pending.delete(id);
      payloads.delete(id);
    },
    fireLatest() {
      const id = Math.max(...pending.keys());
      const callback = pending.get(id);
      pending.delete(id);
      payloads.delete(id);
      callback?.();
    },
    latestPayload() {
      return payloads.get(Math.max(...payloads.keys()));
    },
    pendingCount() {
      return pending.size;
    },
  };
}
