import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_PANEL_INTENT,
} from "../../src/core/machine/events.js";
import { MACHINE_EFFECT_KIND } from "../../src/core/machine/effects.js";
import {
  clearStatusNotice,
  createStatusNoticeResult,
  requestPanelIntent,
} from "../../src/core/machine/panel-status-transition.js";
import {
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import {
  withStatusNotice,
} from "../../src/core/machine/transition-result.js";

const CLIPBOARD_MISSING_IMAGE_NOTICE = "clipboard-missing-image";
const PASTE_CANCELLED_NOTICE = "paste-cancelled";

test("status notice is canonical machine state with timeout effects", () => {
  const result = applyStatus(createStatusNoticeResult(createInitialMachineState(), {
    noticeKind: CLIPBOARD_MISSING_IMAGE_NOTICE,
  }));

  assert.deepEqual(result.state.status, {
    notice: {
      requestId: 1,
      kind: CLIPBOARD_MISSING_IMAGE_NOTICE,
      payload: null,
    },
    lastRequestId: 1,
  });
  assert.equal(selectPanelStatusText(result.state), "Clipboard does not contain an image.");
  assert.deepEqual(result.effects, [{
    kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
    requestId: 1,
  }]);
});

test("clearing a current status notice falls back to derived baseline status", () => {
  const noticed = applyStatus(createStatusNoticeResult(createInitialMachineState(), {
    noticeKind: PASTE_CANCELLED_NOTICE,
  })).state;

  const cleared = clearStatusNotice(noticed, {
    requestId: noticed.status.notice.requestId,
  });

  assert.equal(cleared.state.status.notice, null);
  assert.equal(cleared.state.status.lastRequestId, 1);
  assert.equal(selectPanelStatusText(cleared.state), "Paste a screenshot to begin.");
  assert.deepEqual(cleared.effects, [{
    kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
    requestId: 1,
  }]);
});

test("stale status notice clear is ignored", () => {
  const noticed = applyStatus(createStatusNoticeResult(createInitialMachineState(), {
    noticeKind: PASTE_CANCELLED_NOTICE,
  })).state;

  const staleClear = clearStatusNotice(noticed, {
    requestId: noticed.status.notice.requestId + 1,
  });

  assert.deepEqual(staleClear.state, noticed);
  assert.deepEqual(staleClear.effects, []);
});

test("clipboard-missing notice composes with active paste instructions", () => {
  let state = requestPanelIntent(createInitialMachineState(), {
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  }).state;
  state = applyStatus(createStatusNoticeResult(state, {
    noticeKind: CLIPBOARD_MISSING_IMAGE_NOTICE,
  })).state;

  assert.equal(
    selectPanelStatusText(state),
    "Clipboard does not contain an image. Press Ctrl/Cmd+V to paste an image from your clipboard.",
  );
});

test("new panel intent clears stale status notice and its timeout", () => {
  let state = applyStatus(createStatusNoticeResult(createInitialMachineState(), {
    noticeKind: PASTE_CANCELLED_NOTICE,
  })).state;

  const result = requestPanelIntent(state, {
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  });

  assert.equal(result.state.status.notice, null);
  assert.equal(result.state.status.lastRequestId, 1);
  assert.equal(selectPanelStatusText(result.state), "Press Ctrl/Cmd+V to paste an image from your clipboard.");
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
      requestId: 1,
    },
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
});

function applyStatus(result) {
  return withStatusNotice(result);
}
