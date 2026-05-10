import test from "node:test";
import assert from "node:assert/strict";

import {
  createRuntimeDriver,
} from "../../../bootstrap/runtime.js";

// Class-b, deliberately not class-a: serial effect scheduling is a current
// driver policy, not an inevitable hexagonal law. A future runtime could expose
// explicit parallelism; this protects today's deterministic sequencing contract.
test("runtime executes multiple effects in declared order", async () => {
  const order = [];
  let firstFinished = false;
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {
      first: async () => {
        order.push("first:start");
        await Promise.resolve();
        firstFinished = true;
        order.push("first:end");
        return null;
      },
      second: async () => {
        assert.equal(firstFinished, true);
        order.push("second");
        return null;
      },
    },
    stepApplication({ state }) {
      return {
        state,
        effects: [
          {
            kind: "first",
          },
          {
            kind: "second",
          },
        ],
      };
    },
  });

  await runtime.dispatch({
    kind: "start",
  });

  assert.deepEqual(order, [
    "first:start",
    "first:end",
    "second",
  ]);
});
