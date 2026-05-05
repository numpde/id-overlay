import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EFFECT_KIND,
} from "../../src/core/machine/effects.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import {
  createStatusNotice,
  createTransitionResult,
  withHistoryRecord,
  withStatusNotice,
} from "../../src/core/machine/transition-result.js";

test("withHistoryRecord commits only explicit history records", () => {
  const state = createInitialMachineState({
    history: {
      past: [{ kind: "existing-edit" }],
      future: [{ kind: "redo-edit" }],
    },
  });
  const historyRecord = { kind: "next-edit", label: "Next edit" };

  const result = withHistoryRecord(createTransitionResult({
    state,
    historyRecord,
  }));

  assert.deepEqual(result.state.history, {
    past: [
      { kind: "existing-edit" },
      historyRecord,
    ],
    future: [],
  });
  assert.equal(result.historyRecord, historyRecord);
});

test("withStatusNotice applies status timeout lifecycle explicitly", () => {
  const state = createInitialMachineState({
    status: {
      notice: {
        requestId: 1,
        kind: "paste-cancelled",
        payload: null,
      },
      lastRequestId: 1,
    },
  });
  const existingEffect = { kind: "existing-effect" };

  const result = withStatusNotice(createTransitionResult({
    state,
    effects: [existingEffect],
    statusNotice: createStatusNotice("clipboard-missing-image"),
  }));

  assert.deepEqual(result.state.status, {
    notice: {
      requestId: 2,
      kind: "clipboard-missing-image",
      payload: null,
    },
    lastRequestId: 2,
  });
  assert.deepEqual(result.effects, [
    existingEffect,
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 2,
    },
  ]);
});

test("history and status combinators compose in machine commit order", () => {
  const state = createInitialMachineState();
  const historyRecord = { kind: "visible-edit" };

  const result = withStatusNotice(withHistoryRecord(createTransitionResult({
    state,
    historyRecord,
    statusNotice: createStatusNotice("image-loaded"),
  })));

  assert.deepEqual(result.state.history.past, [historyRecord]);
  assert.equal(result.state.status.notice.requestId, 1);
  assert.equal(result.historyRecord, historyRecord);
  assert.equal(result.statusNotice, null);
});
