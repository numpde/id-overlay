import test from "node:test";
import assert from "node:assert/strict";

import { createValueStore } from "../../src/core/value-store.js";

test("value store emits current value by default", () => {
  const store = createValueStore("a");
  let received = null;
  store.subscribe((value) => {
    received = value;
  });
  assert.equal(received, "a");
});

test("value store can skip initial emission", () => {
  const store = createValueStore("a");
  let calls = 0;
  store.subscribe(() => {
    calls += 1;
  }, { emitCurrent: false });
  assert.equal(calls, 0);
  store.set("b");
  assert.equal(calls, 1);
});

test("value store does not notify on no-op writes", () => {
  const store = createValueStore("a");
  const seen = [];

  store.subscribe((value) => {
    seen.push(value);
  }, { emitCurrent: false });

  assert.equal(store.set("a"), "a");
  assert.equal(store.set("b"), "b");
  assert.equal(store.set("b"), "b");

  assert.deepEqual(seen, ["b"]);
});
