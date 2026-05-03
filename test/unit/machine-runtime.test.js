import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EVENT_KIND,
  MACHINE_MODE,
  MACHINE_STATUS_NOTICE_KIND,
} from "../../src/core/machine/events.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import {
  createMachineRuntime,
} from "../../src/core/machine/runtime.js";
import { normalizeSessionImage } from "../../src/core/session.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});
const NORMALIZED_IMAGE = normalizeSessionImage(IMAGE);

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

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

test("dispatch commits transition state and returns the full transition result", () => {
  const runtime = createMachineRuntime();
  const result = runtime.dispatch(loadImageEvent());

  assert.equal(runtime.getState(), result.state);
  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.state.session.image, NORMALIZED_IMAGE);
  assert.equal(result.historyRecord.kind, "load-image");
});

test("subscribers receive the current state by default and then committed updates", () => {
  const runtime = createMachineRuntime();
  const states = [];
  const initialState = runtime.getState();

  runtime.subscribe((state) => states.push(state));
  const result = runtime.dispatch(loadImageEvent());

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

  const first = runtime.dispatch(loadImageEvent());
  unsubscribe();
  runtime.dispatch({ type: MACHINE_EVENT_KIND.CLEAR_IMAGE });

  assert.deepEqual(states, [first.state]);
});

test("no-op transitions do not notify subscribers", () => {
  const runtime = createMachineRuntime();
  const states = [];
  runtime.subscribe((state) => states.push(state), { emitCurrent: false });

  const result = runtime.dispatch({
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  });

  assert.equal(result.state, runtime.getState());
  assert.equal(states.length, 0);
});

test("undo and redo flow through the same dispatch path", () => {
  const runtime = createMachineRuntime();
  runtime.dispatch(loadImageEvent());

  const undo = runtime.dispatch({ type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.image, null);
  assert.equal(undo.state.history.future.length, 1);

  const redo = runtime.dispatch({ type: MACHINE_EVENT_KIND.REDO });
  assert.deepEqual(redo.state.session.image, NORMALIZED_IMAGE);
  assert.equal(redo.state.history.future.length, 0);
});

test("effects execute after state commit with event, state, and result context", () => {
  const calls = [];
  const runtime = createMachineRuntime({
    executeEffect(effect, context) {
      calls.push({ effect, context, committedState: runtime.getState() });
    },
  });
  const event = { type: "test-effect" };
  const result = runtime.dispatch(event, {
    transition: (state) => ({
      state: {
        ...state,
        status: committedStatus(),
      },
      effects: [{ type: "external-work" }],
      historyRecord: null,
      consumedHistoryRecord: null,
    }),
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].effect, { type: "external-work" });
  assert.equal(calls[0].context.event, event);
  assert.equal(calls[0].context.state, result.state);
  assert.equal(calls[0].context.result, result);
  assert.equal(calls[0].committedState, result.state);
});

test("sync effect failures are reported without rolling back committed state", () => {
  const errors = [];
  const runtime = createMachineRuntime({
    executeEffect() {
      throw new Error("boom");
    },
    onEffectError(error, context) {
      errors.push({ error, context });
    },
  });

  const result = dispatchEffectfulTransition(runtime);

  assert.equal(runtime.getState(), result.state);
  assert.equal(runtime.getState().status.notice.kind, MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].error.message, "boom");
  assert.equal(errors[0].context.result, result);
});

test("async effect rejections are reported without rolling back committed state", async () => {
  const errors = [];
  const runtime = createMachineRuntime({
    executeEffect() {
      return Promise.reject(new Error("async boom"));
    },
    onEffectError(error, context) {
      errors.push({ error, context });
    },
  });

  const result = dispatchEffectfulTransition(runtime);
  await Promise.resolve();

  assert.equal(runtime.getState(), result.state);
  assert.equal(runtime.getState().status.notice.kind, MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].error.message, "async boom");
  assert.equal(errors[0].context.result, result);
});

function loadImageEvent() {
  return {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  };
}

function dispatchEffectfulTransition(runtime) {
  return runtime.dispatch({ type: "test-effect" }, {
    transition: (state) => ({
      state: {
        ...state,
        status: committedStatus(),
      },
      effects: [{ type: "external-work" }],
      historyRecord: null,
      consumedHistoryRecord: null,
    }),
  });
}

function committedStatus() {
  return {
    notice: {
      requestId: 1,
      kind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
      payload: null,
    },
    lastRequestId: 1,
  };
}
