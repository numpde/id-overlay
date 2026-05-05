import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EVENT_KIND,
  MACHINE_PANEL_INTENT,
  MACHINE_PASTE_SOURCE,
  MACHINE_STATUS_NOTICE_KIND,
  createCancelPanelIntentEvent,
  createCompletePasteReadEvent,
  createLoadImageEvent,
  createReportStatusNoticeEvent,
} from "../../src/core/machine/events.js";
import { MACHINE_EFFECT_KIND } from "../../src/core/machine/effects.js";
import { createMachineEffectRunner } from "../../src/core/machine/effect-runner.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

test("event constructors centralize effect-runner outcome event shapes", () => {
  assert.deepEqual(createLoadImageEvent({
    image: IMAGE,
    requestId: 7,
  }), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: null,
    requestId: 7,
  });
  assert.deepEqual(createCancelPanelIntentEvent({ requestId: 7 }), {
    type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
    requestId: 7,
    noticeKind: null,
    noticePayload: null,
  });
  assert.deepEqual(createReportStatusNoticeEvent({
    noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
  }), {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
    noticePayload: null,
  });
  assert.deepEqual(createCompletePasteReadEvent({
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: IMAGE,
  }), {
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: IMAGE,
  });
});

test("machine effect runner ignores unknown effects", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => calls.push("paste"),
    startPanelTimeout: () => calls.push("start"),
    cancelPanelTimeout: () => calls.push("cancel"),
    dispatch: (event) => calls.push(event),
    getState: createIdleState,
  });

  await runEffect({ kind: "unknown-effect" }, createContext());

  assert.deepEqual(calls, []);
});

test("start-panel-timeout delegates the exact intent and request id", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    startPanelTimeout: (payload) => calls.push(payload),
    getState: createIdleState,
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [{
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 7,
    context,
  }]);
});

test("cancel-panel-timeout delegates the exact request id", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    cancelPanelTimeout: (payload) => calls.push(payload),
    getState: createIdleState,
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [{
    requestId: 7,
    context,
  }]);
});

test("manual-paste capture effects delegate request id through the effect runner", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    startManualPasteCapture: (payload) => calls.push(["start", payload]),
    cancelManualPasteCapture: (payload) => calls.push(["cancel", payload]),
    getState: createIdleState,
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, context);
  await runEffect({
    kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, context);

  assert.equal(calls[0][0], "start");
  assert.equal(calls[0][1].requestId, 7);
  assert.equal(calls[0][1].context, context);
  assert.equal(typeof calls[0][1].onPasteOutcome, "function");
  assert.deepEqual(calls[1], ["cancel", { requestId: 7, context }]);
});

test("read-paste-image delegates request id and dispatches clipboard-api completion", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    readPasteImage: (payload) => {
      calls.push(["read", payload]);
      return IMAGE;
    },
    dispatch: (event) => calls.push(["dispatch", event]),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [
    ["read", { requestId: 7, context }],
    ["dispatch", {
      type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
      requestId: 7,
      source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
      outcome: IMAGE,
    }],
  ]);
});

test("manual-paste outcome dispatches manual-paste completion", async () => {
  const calls = [];
  let onPasteOutcome;
  const runEffect = createMachineEffectRunner({
    startManualPasteCapture: ({ onPasteOutcome: handler }) => {
      onPasteOutcome = handler;
    },
    dispatch: (event) => calls.push(event),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, createContext());
  onPasteOutcome({
    image: IMAGE,
    placement: "placement",
  });

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    outcome: {
      image: IMAGE,
      placement: "placement",
    },
  }]);
});

test("manual-paste feedback dispatches manual-paste completion", async () => {
  const calls = [];
  let onPasteOutcome;
  const runEffect = createMachineEffectRunner({
    startManualPasteCapture: ({ onPasteOutcome: handler }) => {
      onPasteOutcome = handler;
    },
    dispatch: (event) => calls.push(event),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, createContext());
  onPasteOutcome({
    noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
  });

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    outcome: {
      noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
    },
  }]);
});

test("manual-paste outcome dispatches completion even when request may be stale", async () => {
  const calls = [];
  let onPasteOutcome;
  const runEffect = createMachineEffectRunner({
    startManualPasteCapture: ({ onPasteOutcome: handler }) => {
      onPasteOutcome = handler;
    },
    dispatch: (event) => calls.push(event),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, createContext());
  onPasteOutcome(IMAGE);

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    outcome: IMAGE,
  }]);
});

test("status-timeout effects delegate request id through the effect runner", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    startStatusTimeout: (payload) => calls.push(["start", payload]),
    cancelStatusTimeout: (payload) => calls.push(["cancel", payload]),
    getState: createIdleState,
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
    requestId: 7,
  }, context);
  await runEffect({
    kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [
    ["start", { requestId: 7, context }],
    ["cancel", { requestId: 7, context }],
  ]);
});

test("read-paste-image dispatches nothing when no paste adapter is installed", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    dispatch: (event) => calls.push(event),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, []);
});

test("read-paste-image dispatches completion even when request may be stale", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => IMAGE,
    dispatch: (event) => calls.push(event),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: IMAGE,
  }]);
});

test("read-paste-image reports null clipboard-api completion for manual paste fallback", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => null,
    dispatch: (event) => calls.push(event),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: null,
  }]);
});

test("read-paste-image reports null completion even when request may be stale", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => null,
    dispatch: (event) => calls.push(event),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: null,
  }]);
});

test("read-paste-image dispatches explicit status outcomes as clipboard-api completion", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => ({
      noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
    }),
    dispatch: (event) => calls.push(event),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.COMPLETE_PASTE_READ,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: {
      noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
    },
  }]);
});

test("sync callback throw reports onError and does not rethrow", async () => {
  const errors = [];
  const effect = {
    kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 7,
  };
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    startPanelTimeout: () => {
      throw new Error("boom");
    },
    getState: createIdleState,
    onError: (error, payload) => errors.push({ error, payload }),
  });

  await runEffect(effect, context);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].error.message, "boom");
  assert.deepEqual(errors[0].payload, { effect, context });
});

test("async callback rejection reports onError and does not rethrow", async () => {
  const errors = [];
  const effect = {
    kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    requestId: 7,
  };
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    cancelPanelTimeout: () => Promise.reject(new Error("async boom")),
    getState: createIdleState,
    onError: (error, payload) => errors.push({ error, payload }),
  });

  await runEffect(effect, context);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].error.message, "async boom");
  assert.deepEqual(errors[0].payload, { effect, context });
});

function createContext() {
  return {
    event: { type: "source-event" },
    state: createInitialMachineState(),
    result: { state: createInitialMachineState() },
  };
}

function createIdleState() {
  return createInitialMachineState();
}

function createPasteState(requestId) {
  return () => createInitialMachineState({
    panel: {
      intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
      requestId,
    },
  });
}
