import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageSnapshotWatcher,
} from "../../src/content/page-adapter/snapshot-watcher.js";

test("snapshot watcher starts page observation, window events, and a RAF polling loop once", () => {
  const hashTarget = createRafTarget();
  const invalidations = [];
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    onInvalidate() {
      invalidations.push("invalidate");
    },
  });

  watcher.start();
  watcher.start();

  assert.deepEqual(hashTarget.addedEvents, [
    ["resize", undefined],
    ["scroll", { passive: true }],
    ["hashchange", undefined],
    ["popstate", undefined],
  ]);
  assert.deepEqual(hashTarget.requestedFrames, [1]);

  hashTarget.runFrame(1);

  assert.deepEqual(invalidations, ["invalidate"]);
  assert.deepEqual(hashTarget.requestedFrames, [1, 2]);

  watcher.stop();

  assert.deepEqual(hashTarget.cancelledFrames, [2]);
  assert.deepEqual(hashTarget.removedEvents, [
    "resize",
    "scroll",
    "hashchange",
    "popstate",
  ]);
});

test("snapshot watcher invalidates for every window observation event", () => {
  const hashTarget = createRafTarget();
  const invalidations = [];
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    onInvalidate() {
      invalidations.push("invalidate");
    },
  });

  watcher.start();
  hashTarget.dispatch("resize");
  hashTarget.dispatch("scroll");
  hashTarget.dispatch("hashchange");
  hashTarget.dispatch("popstate");

  assert.deepEqual(invalidations, [
    "invalidate",
    "invalidate",
    "invalidate",
    "invalidate",
  ]);
});

test("snapshot watcher removes the same event listeners it installed", () => {
  const hashTarget = createRafTarget();
  const invalidations = [];
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    onInvalidate() {
      invalidations.push("invalidate");
    },
  });

  watcher.start();
  watcher.stop();
  hashTarget.dispatch("resize");
  hashTarget.dispatch("scroll");
  hashTarget.dispatch("hashchange");
  hashTarget.dispatch("popstate");

  assert.deepEqual(invalidations, []);
});

test("snapshot watcher falls back to interval polling when RAF is unavailable", () => {
  const hashTarget = createIntervalTarget();
  const invalidations = [];
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    onInvalidate() {
      invalidations.push("invalidate");
    },
  });

  watcher.start();

  assert.deepEqual(hashTarget.intervals, [{ id: 1, delay: 150 }]);

  hashTarget.runInterval(1);

  assert.deepEqual(invalidations, ["invalidate"]);

  watcher.stop();

  assert.deepEqual(hashTarget.clearedIntervals, [1]);
});

test("snapshot watcher stop is inert before start and after stop", () => {
  const hashTarget = createRafTarget();
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    onInvalidate() {},
  });

  watcher.stop();
  watcher.start();
  watcher.stop();
  watcher.stop();

  assert.deepEqual(hashTarget.requestedFrames, [1]);
  assert.deepEqual(hashTarget.cancelledFrames, [1]);
});

test("snapshot watcher cancels RAF polling even when the browser returns frame id zero", () => {
  const hashTarget = createRafTarget({ startFrameId: 0 });
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    onInvalidate() {},
  });

  watcher.start();
  watcher.stop();

  assert.deepEqual(hashTarget.requestedFrames, [0]);
  assert.deepEqual(hashTarget.cancelledFrames, [0]);
});

test("snapshot watcher does not reschedule RAF polling when stopped during a tick", () => {
  const hashTarget = createRafTarget();
  let watcher = null;
  watcher = createPageSnapshotWatcher({
    hashTarget,
    onInvalidate() {
      watcher.stop();
    },
  });

  watcher.start();
  hashTarget.runFrame(1);

  assert.deepEqual(hashTarget.requestedFrames, [1]);
  assert.deepEqual(hashTarget.cancelledFrames, [1]);
});

function createBaseTarget() {
  const listeners = new Map();
  return {
    addedEvents: [],
    removedEvents: [],
    addEventListener(type, listener, options) {
      this.addedEvents.push([type, options]);
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      this.removedEvents.push(type);
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
    dispatch(type) {
      listeners.get(type)?.();
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
