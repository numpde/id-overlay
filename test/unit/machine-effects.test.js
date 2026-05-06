import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "../../src/core/machine/events.js";
import {
  MACHINE_EFFECT_KIND,
  MACHINE_PASTE_SOURCE,
  createClipboardFactPasteReadOutcome,
  createPanelTimeoutElapsedResult,
  createReadPasteImageResult,
  createStatusTimeoutElapsedResult,
} from "../../src/core/machine/effects.js";
import { transitionMachineEffectResult } from "../../src/core/machine/effect-result-transition.js";
import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createDecodedClipboardImageFact,
} from "../../src/core/clipboard-facts.js";
import {
  createIdlePanel,
  createInitialMachineState,
  isValidPanelRequestId,
  normalizePanel,
  replacePanel,
} from "../../src/core/machine/state.js";
import {
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import {
  addPin,
  createHost,
  createLoadedHost,
  IMAGE,
  PLACEMENT,
} from "../helpers/machine-scenarios.js";

test("initial panel is idle", () => {
  assert.deepEqual(createInitialMachineState().panel, createIdlePanel());
});

test("panel helpers centralize intent normalization and request id validity", () => {
  assert.deepEqual(normalizePanel({
    intent: "invalid",
    requestId: 0,
  }), createIdlePanel());
  assert.deepEqual(normalizePanel({
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
    requestId: 3,
  }), {
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
    requestId: 3,
  });
  assert.equal(isValidPanelRequestId(null), false);
  assert.equal(isValidPanelRequestId(3), true);
  assert.deepEqual(replacePanel(createInitialMachineState(), {
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 4,
  }).panel, {
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 4,
  });
});

test("requesting paste arms intent and emits read-paste plus timeout effects", () => {
  const result = requestPanelIntent(createHost(), MACHINE_PANEL_INTENT.PASTE_ARMED);

  assert.equal(result.state.panel.intent, MACHINE_PANEL_INTENT.PASTE_ARMED);
  assert.equal(result.state.panel.requestId, 1);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord, null);
});

test("requesting paste again cancels the old request and arms a new one", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);

  const result = requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);

  assert.equal(result.state.panel.requestId, 2);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
      requestId: 2,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
      requestId: 2,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
      requestId: 2,
    },
  ]);
});

test("requesting unknown panel intent is a pure no-op", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = requestPanelIntent(host, "invalid");

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
});

test("cancelling panel intent clears request id and emits cancel-timeout effect", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);

  const result = host.cancelPanelIntent();

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
  ]);
});

test("request-bound panel cancellation ignores stale request ids", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = host.cancelPanelIntent({
    requestId: before.panel.requestId + 1,
  });

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
});

test("request-bound panel cancellation clears only the matching request id", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);

  const result = host.cancelPanelIntent({
    requestId: state(host).panel.requestId,
  });

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
  ]);
});

test("panel timeout effect result clears only the matching request id", () => {
  const host = createLoadedHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  const before = state(host);

  const staleResult = transitionMachineEffectResult(before, createPanelTimeoutElapsedResult({
    requestId: before.panel.requestId + 1,
  }));
  assert.deepEqual(staleResult.state, before);
  assert.deepEqual(staleResult.effects, []);

  const currentResult = transitionMachineEffectResult(before, createPanelTimeoutElapsedResult({
    requestId: before.panel.requestId,
  }));
  assert.deepEqual(currentResult.state.panel, createIdlePanel());
  assert.deepEqual(currentResult.effects, [{
    kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    requestId: before.panel.requestId,
  }]);
});

test("requesting clear-image confirmation clears stale status and emits a timeout effect", () => {
  const host = createLoadedHost();

  const result = requestPanelIntent(host, MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);

  assert.equal(result.state.panel.intent, MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  assert.equal(result.state.panel.requestId, 1);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
      requestId: 1,
    },
  ]);
});

test("requesting clear-pins confirmation clears stale status and emits a timeout effect", () => {
  const host = createLoadedHost();
  addPin(host);

  const result = requestPanelIntent(host, MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);

  assert.equal(result.state.panel.intent, MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);
  assert.equal(result.state.panel.requestId, 1);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
      requestId: 2,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
      requestId: 1,
    },
  ]);
});

test("confirmed clear-image cancels timeout and records clear-image history", () => {
  const host = createLoadedHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);

  const result = host.clearImage();

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 2,
    },
  ]);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
});

test("confirmed clear-pins cancels timeout and records clear-pins history", () => {
  const host = createLoadedHost();
  addPin(host);
  requestPanelIntent(host, MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);

  const result = host.clearPins();

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 3,
    },
  ]);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
});

test("stale request-bound image load is a pure no-op", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = loadImageForRequest(host, {
    requestId: before.panel.requestId + 1,
  });

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
});

test("stale paste effect result is a pure no-op", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = transitionMachineEffectResult(before, createReadPasteImageResult({
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: createDecodedPasteOutcome(),
    requestId: before.panel.requestId + 1,
  }));

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
});

test("paste effect result with unknown source is a pure no-op", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = transitionMachineEffectResult(before, createReadPasteImageResult({
    source: "unknown",
    outcome: createDecodedPasteOutcome(),
    requestId: before.panel.requestId,
  }));

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
});

test("null paste effect result keeps paste armed for manual paste fallback", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = transitionMachineEffectResult(before, createReadPasteImageResult({
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: null,
    requestId: before.panel.requestId,
  }));

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
});

test("paste effect result with image loads image through canonical session transition", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = transitionMachineEffectResult(before, createReadPasteImageResult({
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: createDecodedPasteOutcome(),
    requestId: before.panel.requestId,
  }));

  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
});

test("clipboard-api paste failure keeps paste armed", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = transitionMachineEffectResult(before, createReadPasteImageResult({
    source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    outcome: createMissingImagePasteOutcome(),
    requestId: before.panel.requestId,
  }));

  assert.equal(result.state.panel.intent, MACHINE_PANEL_INTENT.PASTE_ARMED);
  assert.equal(
    selectPanelStatusText(result.state),
    "Clipboard does not contain an image. Press Ctrl/Cmd+V to paste an image from your clipboard.",
  );
  assert.deepEqual(result.effects, [{
    kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
    requestId: 1,
  }]);
  assert.equal(result.historyRecord, null);
});

test("manual paste failure cancels paste before reporting status", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);
  const before = state(host);

  const result = transitionMachineEffectResult(before, createReadPasteImageResult({
    source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    outcome: createMissingImagePasteOutcome(),
    requestId: before.panel.requestId,
  }));

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.equal(selectPanelStatusText(result.state), "Clipboard does not contain an image.");
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord, null);
});

test("status timeout effect result clears only the matching request id", () => {
  const host = createHost();
  host.reportRuntimeError({ message: "runtime failure" });
  const before = state(host);

  const staleResult = transitionMachineEffectResult(before, createStatusTimeoutElapsedResult({
    requestId: before.status.notice.requestId + 1,
  }));
  assert.deepEqual(staleResult.state, before);
  assert.deepEqual(staleResult.effects, []);

  const currentResult = transitionMachineEffectResult(before, createStatusTimeoutElapsedResult({
    requestId: before.status.notice.requestId,
  }));
  assert.equal(currentResult.state.status.notice, null);
  assert.deepEqual(currentResult.effects, [{
    kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
    requestId: before.status.notice.requestId,
  }]);
});

test("redoing image load while paste is armed cancels active panel timeout", () => {
  const host = createLoadedHost();
  host.activateUndo();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);

  const result = host.activateRedo();

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 3,
    },
  ]);
});

test("undoing clear-image while paste is armed cancels active panel timeout", () => {
  const host = createLoadedHost();
  host.clearImage();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);

  const result = host.activateUndo();

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 3,
    },
  ]);
});

test("loading image after paste cancels timeout and records load-image history", () => {
  const host = createHost();
  requestPanelIntent(host, MACHINE_PANEL_INTENT.PASTE_ARMED);

  const result = loadImageForRequest(host, {
    requestId: state(host).panel.requestId,
  });

  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
});

function state(host) {
  return host.getState();
}

function requestPanelIntent(host, intent) {
  return host.requestPanelIntent(intent);
}

function loadImageForRequest(host, { requestId }) {
  return host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
    requestId,
  });
}

function createDecodedPasteOutcome() {
  return createClipboardFactPasteReadOutcome({
    fact: createDecodedClipboardImageFact({ image: IMAGE }),
    snapshot: createPageSnapshot(),
  });
}

function createMissingImagePasteOutcome() {
  return createClipboardFactPasteReadOutcome({
    fact: createClipboardImageFailureFact({
      kind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
    }),
    snapshot: createPageSnapshot(),
  });
}

function createPageSnapshot() {
  return {
    mapView: {
      center: { lat: -1.23, lon: 36.84 },
      zoom: 16,
    },
  };
}
