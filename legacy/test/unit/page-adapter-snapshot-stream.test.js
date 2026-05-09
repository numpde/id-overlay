import test from "node:test";
import assert from "node:assert/strict";

import { createPageSnapshotStream } from "../../src/content/page-adapter/snapshot-stream.js";

test("page snapshot stream starts on first subscriber and stops on last unsubscribe", () => {
  const calls = [];
  const snapshots = [{ id: 1 }];
  const stream = createSnapshotStream({
    calls,
    readSnapshot({ lastSnapshot }) {
      calls.push(["read", lastSnapshot]);
      return snapshots[0];
    },
  });

  const unsubscribe = stream.subscribe((snapshot) => {
    calls.push(["listener", snapshot]);
  });
  unsubscribe();

  assert.deepEqual(calls, [
    "start",
    ["read", null],
    ["listener", snapshots[0]],
    "stop",
  ]);
});

test("page snapshot stream emits changed snapshots only", () => {
  const calls = [];
  const snapshots = [{ id: 1 }, { id: 1 }, { id: 2 }];
  const receivedSnapshots = [];
  const stream = createSnapshotStream({
    calls,
    readSnapshot({ lastSnapshot }) {
      calls.push(["read", lastSnapshot]);
      return snapshots.shift();
    },
    snapshotsEqual(left, right) {
      return left.id === right.id;
    },
  });

  const unsubscribe = stream.subscribe((snapshot) => {
    receivedSnapshots.push(snapshot);
  });
  stream.notifyIfChanged();
  stream.notifyIfChanged();
  unsubscribe();

  assert.deepEqual(receivedSnapshots, [
    { id: 1 },
    { id: 2 },
  ]);
  assert.deepEqual(calls.filter((call) => Array.isArray(call)), [
    ["read", null],
    ["read", { id: 1 }],
    ["read", { id: 1 }],
  ]);
});

test("page snapshot stream destroy clears listeners without stopping external watching", () => {
  const calls = [];
  const stream = createSnapshotStream({
    calls,
    readSnapshot() {
      return { id: 1 };
    },
  });
  stream.subscribe(() => {
    calls.push("listener");
  });

  stream.destroy();
  stream.notifyIfChanged();

  assert.deepEqual(calls, [
    "start",
    "listener",
  ]);
});

test("page snapshot stream is inert after destroy", () => {
  const calls = [];
  const stream = createSnapshotStream({
    calls,
    readSnapshot() {
      calls.push("read");
      return { id: 1 };
    },
  });
  const unsubscribe = stream.subscribe(() => {
    calls.push("listener");
  });

  stream.destroy();
  unsubscribe();
  stream.subscribe(() => {
    calls.push("late-listener");
  });
  stream.notifyIfChanged();

  assert.deepEqual(calls, [
    "start",
    "read",
    "listener",
  ]);
});

function createSnapshotStream({
  calls,
  readSnapshot,
  snapshotsEqual = Object.is,
}) {
  return createPageSnapshotStream({
    readSnapshot,
    snapshotsEqual,
    onFirstSubscriber() {
      calls.push("start");
    },
    onNoSubscribers() {
      calls.push("stop");
    },
    notifyListener(listener, snapshot) {
      listener(snapshot);
    },
  });
}
