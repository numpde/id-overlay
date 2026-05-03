import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EVENT_KIND,
  MACHINE_PANEL_INTENT,
  MACHINE_STATUS_NOTICE_KIND,
} from "../../src/core/machine/events.js";
import { MACHINE_EFFECT_KIND } from "../../src/core/machine/effects.js";
import {
  selectStatus,
} from "../../src/core/machine/selectors.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import { transitionMachine } from "../../src/core/machine/transition.js";

test("status notice is canonical machine state with timeout effects", () => {
  const result = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
  });

  assert.deepEqual(result.state.status, {
    notice: {
      requestId: 1,
      kind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
      payload: null,
    },
    lastRequestId: 1,
  });
  assert.equal(selectStatus(result.state), "Clipboard does not contain an image.");
  assert.deepEqual(result.effects, [{
    kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
    requestId: 1,
  }]);
});

test("clearing a current status notice falls back to derived baseline status", () => {
  const noticed = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
  }).state;

  const cleared = transitionMachine(noticed, {
    type: MACHINE_EVENT_KIND.CLEAR_STATUS_NOTICE,
    requestId: noticed.status.notice.requestId,
  });

  assert.equal(cleared.state.status.notice, null);
  assert.equal(cleared.state.status.lastRequestId, 1);
  assert.equal(selectStatus(cleared.state), "Paste a screenshot to begin.");
  assert.deepEqual(cleared.effects, [{
    kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
    requestId: 1,
  }]);
});

test("stale status notice clear is ignored", () => {
  const noticed = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
  }).state;

  const staleClear = transitionMachine(noticed, {
    type: MACHINE_EVENT_KIND.CLEAR_STATUS_NOTICE,
    requestId: noticed.status.notice.requestId + 1,
  });

  assert.deepEqual(staleClear.state, noticed);
  assert.deepEqual(staleClear.effects, []);
});

test("clipboard-missing notice composes with active paste instructions", () => {
  let state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  }).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
  }).state;

  assert.equal(
    selectStatus(state),
    "Clipboard does not contain an image. Press Ctrl/Cmd+V to paste an image from your clipboard.",
  );
});

test("new panel intent clears stale status notice and its timeout", () => {
  let state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  });

  assert.equal(result.state.status.notice, null);
  assert.equal(result.state.status.lastRequestId, 1);
  assert.equal(selectStatus(result.state), "Press Ctrl/Cmd+V to paste an image from your clipboard.");
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
