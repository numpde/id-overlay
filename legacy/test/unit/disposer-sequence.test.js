import test from "node:test";
import assert from "node:assert/strict";

import { createDisposerSequence } from "../../src/content/disposer-sequence.js";

test("disposer sequence runs disposers once in declared order", () => {
  const calls = [];
  const sequence = createDisposerSequence([
    () => calls.push("first"),
    () => calls.push("second"),
    () => calls.push("third"),
  ]);

  sequence.destroy();
  sequence.destroy();

  assert.deepEqual(calls, ["first", "second", "third"]);
});

test("disposer sequence preserves throw semantics after marking destroyed", () => {
  const calls = [];
  const sequence = createDisposerSequence([
    () => calls.push("first"),
    () => {
      throw new Error("dispose exploded");
    },
    () => calls.push("third"),
  ]);

  assert.throws(() => sequence.destroy(), /dispose exploded/);
  sequence.destroy();

  assert.deepEqual(calls, ["first"]);
});
