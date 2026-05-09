import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
} from "../../src/core/machine/events.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
  createSemanticHistoryRecord,
} from "../../src/core/machine/history.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import {
  createMachineRuntime,
} from "../../src/core/machine/runtime.js";

test("machine runtime defaults to the initial machine state", () => {
  const runtime = createMachineRuntime();

  assert.deepEqual(runtime.getState(), createInitialMachineState());
});

test("machine runtime normalizes custom initial state", () => {
  const runtime = createMachineRuntime({
    initialState: {
      session: {
        mode: MACHINE_MODE.ALIGN,
        opacity: 2,
      },
    },
  });

  assert.equal(runtime.getState().session.mode, MACHINE_MODE.ALIGN);
  assert.equal(runtime.getState().session.opacity, 1);
  assert.equal(runtime.getState().session.image, null);
});

test("commitMachineResult commits transition state and returns the full result", () => {
  const runtime = createMachineRuntime();
  const historyRecord = createSemanticHistoryRecord({
    kind: MACHINE_HISTORY_KIND.MOVE_OVERLAY,
    label: "Test visible edit",
    undoLabel: "Undo test visible edit",
    redoLabel: "Redo test visible edit",
    undo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE,
    },
    redo: {
      operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE,
    },
  });
  const result = runtime.commitMachineResult(createTransitionResult({
    state: createInitialMachineState({
      session: {
        mode: MACHINE_MODE.ALIGN,
      },
    }),
    historyRecord,
  }));

  assert.equal(runtime.getState(), result.state);
  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.historyRecord, historyRecord);
});

test("subscribers receive the current state by default and then committed updates", () => {
  const runtime = createMachineRuntime();
  const states = [];
  const initialState = runtime.getState();

  runtime.subscribe((state) => states.push(state));
  const result = runtime.commitMachineResult(createTransitionResult({
    state: createInitialMachineState({
      session: {
        mode: MACHINE_MODE.ALIGN,
      },
    }),
  }));

  assert.equal(states.length, 2);
  assert.equal(states[0], initialState);
  assert.equal(states[1], result.state);
});

test("subscribers can skip initial emission and unsubscribe from future updates", () => {
  const runtime = createMachineRuntime();
  const states = [];
  const unsubscribe = runtime.subscribe((state) => states.push(state), {
    emitCurrent: false,
  });

  const first = runtime.commitMachineResult(createTransitionResult({
    state: createInitialMachineState({
      session: {
        mode: MACHINE_MODE.ALIGN,
      },
    }),
  }));
  unsubscribe();
  runtime.commitMachineResult(createTransitionResult({
    state: createInitialMachineState({
      session: {
        mode: MACHINE_MODE.TRACE,
      },
    }),
  }));

  assert.deepEqual(states, [first.state]);
});

test("no-op results do not notify subscribers", () => {
  const runtime = createMachineRuntime();
  const states = [];
  runtime.subscribe((state) => states.push(state), { emitCurrent: false });

  const result = runtime.commitMachineResult(createTransitionResult({
    state: runtime.getState(),
  }));

  assert.equal(result.state, runtime.getState());
  assert.equal(states.length, 0);
});

test("equal result states keep the previous state identity", () => {
  const runtime = createMachineRuntime();
  const initialState = runtime.getState();
  const states = [];
  runtime.subscribe((state) => states.push(state), { emitCurrent: false });

  const result = runtime.commitMachineResult(createTransitionResult({
    state: {
      session: {
        ...initialState.session,
        registration: {
          ...initialState.session.registration,
          pins: [...initialState.session.registration.pins],
        },
      },
      runtime: {
        ...initialState.runtime,
        pointer: {
          ...initialState.runtime.pointer,
        },
      },
      panel: {
        ...initialState.panel,
      },
      status: {
        ...initialState.status,
      },
      history: {
        past: [...initialState.history.past],
        future: [...initialState.history.future],
      },
    },
  }));

  assert.equal(result.state, initialState);
  assert.equal(runtime.getState(), initialState);
  assert.equal(states.length, 0);
});

test("commitMachineResult returns effects without executing host work", () => {
  const runtime = createMachineRuntime();
  const result = runtime.commitMachineResult(createTransitionResult({
    state: effectfulState(),
    effects: [{ type: "external-work" }],
  }));

  assert.equal(runtime.getState(), result.state);
  assert.equal(runtime.getState().session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.effects, [{ type: "external-work" }]);
});

function effectfulState() {
  return createInitialMachineState({
    session: {
      mode: MACHINE_MODE.ALIGN,
    },
  });
}

function createTransitionResult({
  state,
  effects = [],
  historyRecord = null,
  consumedHistoryRecord = null,
}) {
  return {
    state,
    effects,
    historyRecord,
    consumedHistoryRecord,
  };
}
