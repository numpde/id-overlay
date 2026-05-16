import test from "node:test";
import assert from "node:assert/strict";

import {
  createRuntimeDriver,
} from "../../../bootstrap/runtime.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: serial effect scheduling is a current
// driver policy, not an inevitable hexagonal law. A future runtime could expose
// explicit parallelism; this protects today's deterministic sequencing contract.
test("runtime executes multiple effects in declared order", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "runtime executes multiple effects in declared order",
  });
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
  traceRuntimeEffect(trace, "first-effect", "first");
  traceRuntimeEffect(trace, "second-effect", "second");
});

function traceRuntimeEffect(trace, phase, effectKind) {
  const effectNode = `effect.${effectKind}`;
  trace.edge(flowEdge("source.runtime-dispatch", "command.runtime-dispatch", {
    phase,
    provider: "runtime-driver-witness",
  }));
  trace.edge(flowEdge("command.runtime-dispatch", effectNode, {
    phase,
    provider: "application-effect",
  }));
  trace.edge(flowEdge(effectNode, "port.effect-handler", {
    phase,
    provider: effectKind,
  }));
  trace.edge(flowEdge("port.effect-handler", "sink.effect-handler-call", {
    phase,
    terminal: "host-call",
  }));
}
