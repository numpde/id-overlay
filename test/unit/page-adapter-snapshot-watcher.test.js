import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotWatcher,
} from "../../src/content/page-adapter/snapshot-watcher.js";

test("snapshot watcher starts page observation, window events, and a RAF polling loop once", () => {
  const hashTarget = createRafTarget();
  const pageContext = createPageContextHarness();
  let changeCount = 0;
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    pageContext,
    onChange() {
      changeCount += 1;
    },
  });

  watcher.start();
  watcher.start();

  assert.equal(pageContext.startCount, 1);
  assert.deepEqual(hashTarget.addedEvents, [
    ["resize", undefined],
    ["scroll", { passive: true }],
    ["hashchange", undefined],
    ["popstate", undefined],
  ]);
  assert.deepEqual(hashTarget.requestedFrames, [1]);

  hashTarget.runFrame(1);

  assert.equal(changeCount, 1);
  assert.deepEqual(hashTarget.requestedFrames, [1, 2]);

  watcher.stop();

  assert.equal(pageContext.destroyCount, 1);
  assert.deepEqual(hashTarget.cancelledFrames, [2]);
  assert.deepEqual(hashTarget.removedEvents, [
    "resize",
    "scroll",
    "hashchange",
    "popstate",
  ]);
});

test("snapshot watcher falls back to interval polling when RAF is unavailable", () => {
  const hashTarget = createIntervalTarget();
  const pageContext = createPageContextHarness();
  let changeCount = 0;
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    pageContext,
    onChange() {
      changeCount += 1;
    },
  });

  watcher.start();

  assert.deepEqual(hashTarget.intervals, [{ id: 1, delay: 150 }]);

  hashTarget.runInterval(1);

  assert.equal(changeCount, 1);

  watcher.stop();

  assert.deepEqual(hashTarget.clearedIntervals, [1]);
});

test("snapshot watcher stop is inert before start and after stop", () => {
  const hashTarget = createRafTarget();
  const pageContext = createPageContextHarness();
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    pageContext,
    onChange() {},
  });

  watcher.stop();
  watcher.start();
  watcher.stop();
  watcher.stop();

  assert.equal(pageContext.startCount, 1);
  assert.equal(pageContext.destroyCount, 1);
});

test("snapshot watcher cancels RAF polling even when the browser returns frame id zero", () => {
  const hashTarget = createRafTarget({ startFrameId: 0 });
  const pageContext = createPageContextHarness();
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    pageContext,
    onChange() {},
  });

  watcher.start();
  watcher.stop();

  assert.deepEqual(hashTarget.requestedFrames, [0]);
  assert.deepEqual(hashTarget.cancelledFrames, [0]);
});

test("snapshot watcher does not reschedule RAF polling when stopped during a tick", () => {
  const hashTarget = createRafTarget();
  const pageContext = createPageContextHarness();
  let watcher = null;
  watcher = createPageSnapshotWatcher({
    hashTarget,
    pageContext,
    onChange() {
      watcher.stop();
    },
  });

  watcher.start();
  hashTarget.runFrame(1);

  assert.deepEqual(hashTarget.requestedFrames, [1]);
  assert.deepEqual(hashTarget.cancelledFrames, [1]);
  assert.equal(pageContext.destroyCount, 1);
});

function createPageContextHarness() {
  return {
    startCount: 0,
    destroyCount: 0,
    start() {
      this.startCount += 1;
    },
    destroy() {
      this.destroyCount += 1;
    },
  };
}

function createBaseTarget() {
  return {
    addedEvents: [],
    removedEvents: [],
    addEventListener(type, _listener, options) {
      this.addedEvents.push([type, options]);
    },
    removeEventListener(type) {
      this.removedEvents.push(type);
    },
  };
}

function createRafTarget({ startFrameId = 1 } = {}) {
  const callbacks = new Map();
  let nextFrameId = startFrameId;
  return {
    ...createBaseTarget(),
    requestedFrames: [],
    cancelledFrames: [],
    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      callbacks.set(id, callback);
      this.requestedFrames.push(id);
      return id;
    },
    cancelAnimationFrame(id) {
      this.cancelledFrames.push(id);
      callbacks.delete(id);
    },
    runFrame(id) {
      const callback = callbacks.get(id);
      callbacks.delete(id);
      callback();
    },
  };
}

function createIntervalTarget() {
  const callbacks = new Map();
  let nextIntervalId = 1;
  return {
    ...createBaseTarget(),
    intervals: [],
    clearedIntervals: [],
    setInterval(callback, delay) {
      const id = nextIntervalId;
      nextIntervalId += 1;
      callbacks.set(id, callback);
      this.intervals.push({ id, delay });
      return id;
    },
    clearInterval(id) {
      this.clearedIntervals.push(id);
      callbacks.delete(id);
    },
    runInterval(id) {
      callbacks.get(id)();
    },
  };
}
