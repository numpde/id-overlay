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

