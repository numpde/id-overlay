import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EFFECT_KIND,
} from "../../src/core/machine/effect-requests.js";
import {
  MACHINE_HISTORY_KIND,
} from "../../src/core/machine/events.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
  createSemanticHistoryRecord,
} from "../../src/core/machine/history.js";
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
  const existingRecord = createTestHistoryRecord({
    kind: MACHINE_HISTORY_KIND.MOVE_OVERLAY,
    label: "Existing edit",
  });
  const redoRecord = createTestHistoryRecord({
    kind: MACHINE_HISTORY_KIND.ROTATE_OVERLAY,
    label: "Redo edit",
  });
  const state = createInitialMachineState({
    history: {
      past: [existingRecord],
      future: [redoRecord],
    },
  });
  const historyRecord = createTestHistoryRecord({
    kind: MACHINE_HISTORY_KIND.SCALE_OVERLAY,
    label: "Next edit",
  });

  const result = withHistoryRecord(createTransitionResult({
    state,
    historyRecord,
  }));

  assert.deepEqual(result.state.history, {
    past: [
      existingRecord,
      historyRecord,
    ],
    future: [],
  });
  assert.deepEqual(result.historyRecord, historyRecord);
});

test("withHistoryRecord drops non-semantic history records", () => {
  const state = createInitialMachineState();

  const result = withHistoryRecord(createTransitionResult({
    state,
    historyRecord: { kind: "visible-edit" },
  }));

  assert.equal(result.state, state);
  assert.equal(result.historyRecord, null);
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
  const historyRecord = createTestHistoryRecord({
    kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE,
    label: "Visible edit",
  });

  const result = withStatusNotice(withHistoryRecord(createTransitionResult({
    state,
    historyRecord,
    statusNotice: createStatusNotice("image-loaded"),
  })));

  assert.deepEqual(result.state.history.past, [historyRecord]);
  assert.equal(result.state.status.notice.requestId, 1);
  assert.deepEqual(result.historyRecord, historyRecord);
  assert.equal(result.statusNotice, null);
});

function createTestHistoryRecord({ kind, label }) {
  return createSemanticHistoryRecord({
    kind,
    label,
    undoLabel: `Undo ${label}`,
    redoLabel: `Redo ${label}`,
    undo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE,
    },
    redo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE,
    },
  });
}
