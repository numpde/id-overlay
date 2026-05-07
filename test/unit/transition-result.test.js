import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EFFECT_KIND,
} from "../../src/core/machine/effect-requests.js";
import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
} from "../../src/core/machine/events.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
  commitSemanticHistoryRecord,
  createSemanticHistoryRecord,
} from "../../src/core/machine/history.js";
import {
  applyMachineStatusNotice,
} from "../../src/core/machine/panel-status-transition.js";
import {
  createStatusNotice,
} from "../../src/core/machine/status-notices.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import {
  createTransitionResult,
} from "../../src/core/machine/transition-result.js";
import {
  IMAGE,
  NORMALIZED_IMAGE,
  PLACEMENT,
} from "../helpers/session-fixtures.js";

const REGISTRATION = Object.freeze({
  pins: [
    {
      id: 1,
      imagePx: { x: 400, y: 200 },
      mapLatLon: { lat: -1.23, lon: 36.84 },
    },
  ],
  solvedTransform: null,
  dirty: true,
});

test("commitSemanticHistoryRecord commits only explicit history records", () => {
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

  const result = commitSemanticHistoryRecord(createTransitionResult({
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

test("commitSemanticHistoryRecord drops non-semantic history records", () => {
  const state = createInitialMachineState();

  const result = commitSemanticHistoryRecord(createTransitionResult({
    state,
    historyRecord: { kind: "visible-edit" },
  }));

  assert.equal(result.state, state);
  assert.equal(result.historyRecord, null);
});

test("createSemanticHistoryRecord normalizes replay payloads by operation", () => {
  const record = createSemanticHistoryRecord({
    kind: MACHINE_HISTORY_KIND.LOAD_IMAGE,
    label: "Loaded image",
    undoLabel: "Remove image",
    redoLabel: "Reload image",
    undo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_REGISTRATION,
      registration: REGISTRATION,
      mode: MACHINE_MODE.ALIGN,
      unexpected: true,
    },
    redo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
      session: {
        mode: MACHINE_MODE.ALIGN,
        opacity: 2,
        image: IMAGE,
        placement: PLACEMENT,
        registration: REGISTRATION,
        unexpected: true,
      },
    },
  });

  assert.deepEqual(record.undo, {
    operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_REGISTRATION,
    registration: REGISTRATION,
    mode: MACHINE_MODE.ALIGN,
  });
  assert.deepEqual(record.redo, {
    operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
    session: {
      mode: MACHINE_MODE.ALIGN,
      opacity: 1,
      image: NORMALIZED_IMAGE,
      placement: PLACEMENT,
      registration: REGISTRATION,
    },
  });
});

test("createSemanticHistoryRecord rejects malformed replay payloads", () => {
  assert.throws(() => createSemanticHistoryRecord({
    kind: MACHINE_HISTORY_KIND.LOAD_IMAGE,
    label: "Loaded image",
    undoLabel: "Remove image",
    redoLabel: "Reload image",
    undo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
      session: { image: null },
    },
    redo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE,
    },
  }), TypeError);

  assert.throws(() => createSemanticHistoryRecord({
    kind: MACHINE_HISTORY_KIND.MOVE_OVERLAY,
    label: "Moved overlay",
    undoLabel: "Undo move overlay",
    redoLabel: "Redo move overlay",
    undo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_PLACEMENT,
      placement: PLACEMENT,
    },
    redo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE,
    },
  }), TypeError);
});

test("applyMachineStatusNotice applies status timeout lifecycle explicitly", () => {
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

  const result = applyMachineStatusNotice(createTransitionResult({
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

test("history and status finalizers compose in machine commit order", () => {
  const state = createInitialMachineState();
  const historyRecord = createTestHistoryRecord({
    kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE,
    label: "Visible edit",
  });

  const result = applyMachineStatusNotice(
    commitSemanticHistoryRecord(createTransitionResult({
      state,
      historyRecord,
      statusNotice: createStatusNotice("image-loaded"),
    })),
  );

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
