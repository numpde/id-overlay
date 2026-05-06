import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_PANEL_INTENT,
} from "../../src/core/machine/events.js";
import {
  MACHINE_EFFECT_KIND,
  MACHINE_EFFECT_RESULT_KIND,
  MACHINE_PASTE_SOURCE,
  createPanelTimeoutElapsedResult,
  createReadPasteImageResult,
  createStatusTimeoutElapsedResult,
} from "../../src/core/machine/effects.js";
import { createMachineEffectRunner } from "../../src/core/machine/effect-runner.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import {
  createDecodedImagePasteOutcome,
  createStatusPasteOutcome as createMachineStatusPasteOutcome,
} from "../../src/core/machine/paste-outcome.js";
import { IMAGE } from "../helpers/session-fixtures.js";

const CLIPBOARD_MISSING_IMAGE_NOTICE = "clipboard-missing-image";

test("constructors centralize effect-runner result shapes", () => {
  const outcome = createDecodedPasteOutcome();
  assert.deepEqual(createReadPasteImageResult({
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome,
  }), {
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome,
  });
  assert.equal(createReadPasteImageResult({
    requestId: 7,
    source: "not-a-paste-source",
  }).source, null);
  assert.deepEqual(createPanelTimeoutElapsedResult({
    requestId: 7,
  }), {
    kind: MACHINE_EFFECT_RESULT_KIND.PANEL_TIMEOUT_ELAPSED,
    requestId: 7,
  });
  assert.deepEqual(createStatusTimeoutElapsedResult({
    requestId: 7,
  }), {
    kind: MACHINE_EFFECT_RESULT_KIND.STATUS_TIMEOUT_ELAPSED,
    requestId: 7,
  });
});

test("machine effect runner ignores unknown effects", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => calls.push("paste"),
    startPanelTimeout: () => calls.push("start"),
    cancelPanelTimeout: () => calls.push("cancel"),
    completeEffect: (result) => calls.push(result),
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

test("read-paste-image delegates request id and completes with a clipboard-api result", async () => {
  const calls = [];
  const context = createContext();
  const outcome = createDecodedPasteOutcome();
  const runEffect = createMachineEffectRunner({
    readPasteImage: (payload) => {
      calls.push(["read", payload]);
      return outcome;
    },
    completeEffect: (result) => calls.push(["complete", result]),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [
    ["read", { requestId: 7, context }],
    ["complete", {
      kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
      requestId: 7,
      source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
      outcome,
    }],
  ]);
});

test("manual-paste outcome completes with a manual-paste result", async () => {
  const calls = [];
  let onPasteOutcome;
  const runEffect = createMachineEffectRunner({
    startManualPasteCapture: ({ onPasteOutcome: handler }) => {
      onPasteOutcome = handler;
    },
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, createContext());
  const outcome = createDecodedImagePasteOutcome({
    image: IMAGE,
    placement: "placement",
  });
  onPasteOutcome(outcome);

  assert.deepEqual(calls, [{
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    outcome,
  }]);
});

test("manual-paste feedback completes with a manual-paste result", async () => {
  const calls = [];
  let onPasteOutcome;
  const runEffect = createMachineEffectRunner({
    startManualPasteCapture: ({ onPasteOutcome: handler }) => {
      onPasteOutcome = handler;
    },
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, createContext());
  const outcome = createStatusPasteOutcome(CLIPBOARD_MISSING_IMAGE_NOTICE);
  onPasteOutcome(outcome);

  assert.deepEqual(calls, [{
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    outcome,
  }]);
});

test("manual-paste outcome completes even when request may be stale", async () => {
  const calls = [];
  let onPasteOutcome;
  const runEffect = createMachineEffectRunner({
    startManualPasteCapture: ({ onPasteOutcome: handler }) => {
      onPasteOutcome = handler;
    },
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId: 7,
  }, createContext());
  const outcome = createDecodedPasteOutcome();
  onPasteOutcome(outcome);

  assert.deepEqual(calls, [{
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    outcome,
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

test("read-paste-image completes nothing when no paste adapter is installed", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, []);
});

test("read-paste-image completes even when request may be stale", async () => {
  const calls = [];
  const outcome = createDecodedPasteOutcome();
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => outcome,
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome,
  }]);
});

test("read-paste-image reports null clipboard-api completion for manual paste fallback", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => null,
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: null,
  }]);
});

test("read-paste-image reports null completion even when request may be stale", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => null,
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: null,
  }]);
});

test("read-paste-image completes explicit status outcomes as clipboard-api results", async () => {
  const calls = [];
  const outcome = createStatusPasteOutcome(CLIPBOARD_MISSING_IMAGE_NOTICE);
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => outcome,
    completeEffect: (result) => calls.push(result),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome,
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

function createStatusPasteOutcome(noticeKind) {
  return createMachineStatusPasteOutcome({
    noticeKind,
  });
}

function createDecodedPasteOutcome() {
  return createDecodedImagePasteOutcome({
    image: IMAGE,
    placement: null,
  });
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
