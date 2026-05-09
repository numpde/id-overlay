import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";

// Unclassified: cancellation is only meaningful if late clipboard/paste
// completions cannot resurrect a stale image. This should remain true whether
// the host used navigator clipboard, a paste event, or another image port.
test("cancelled paste ignores later image-read completion", () => {
  const armed = step({}, createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  )).state;
  const cancelled = step(armed, createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  )).state;

  const lateResult = step(cancelled, createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    {
      requestId: armed.referenceImageInput.requestId,
      outcome: {
        kind: "accepted",
        referenceImage: referenceImage(),
      },
    },
  ));

  assert.equal(lateResult.state.session, undefined);
  assert.equal(lateResult.state.notice.kind, "reference-image-paste-cancelled");
  assert.deepEqual(lateResult.effects, []);
});

// Unclassified: failed paste should be visible as a paste failure, not silently
// collapsed into the same status as an empty clipboard. The exact wording can
// move to a view-model, but the product fact should keep the failure reason.
test("failed paste reports a reason-specific paste notice", () => {
  const armed = step({}, createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  )).state;

  const result = step(armed, createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    {
      requestId: armed.referenceImageInput.requestId,
      outcome: {
        kind: "failed",
        reason: "decode-failed",
      },
    },
  ));

  assert.deepEqual(result.state.notice, {
    kind: "reference-image-paste-failed",
    reason: "decode-failed",
    requestId: armed.referenceImageInput.requestId,
  });
  assert.equal(result.state.session, undefined);
  assert.deepEqual(result.effects, []);
});

// Unclassified: with visible pins, the destructive primary action should clear
// pins before escalating to image removal. This preserves the old user posture
// without committing to legacy panel internals.
test("primary action clears visible pins before clearing the image", () => {
  const state = loadedState({
    pins: [firstPin()],
  });

  const confirmPins = step(state, createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  )).state;
  assert.deepEqual(confirmPins.panelIntent, {
    kind: "confirm-clear-pins",
  });

  const clearedPins = step(confirmPins, createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  ));
  assert.deepEqual(clearedPins.state.session.registration?.pins ?? [], []);
  assert.equal(clearedPins.state.session.referenceImage.imageDataRef, "reference-image-data-1");
  assert.deepEqual(clearedPins.state.panelIntent, null);
  assert.deepEqual(clearedPins.state.notice, {
    kind: "cleared-pins",
    count: 1,
  });
});

// Unclassified: undo/redo should describe and replay semantic user-visible
// changes. It should not replay raw commands or leave stale confirmation intent.
test("undo and redo restore committed image removal and reset confirmation intent", () => {
  const state = loadedState({
    panelIntent: {
      kind: "confirm-clear-reference-image",
    },
  });

  const cleared = step(state, createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  )).state;
  const undo = step(cleared, {
    kind: "undo",
  }).state;

  assert.deepEqual(undo.session, state.session);
  assert.equal(undo.panelIntent, null);
  assert.deepEqual(selectApplicationView(undo).history.redo, {
    enabled: true,
    label: "Remove image",
  });

  const redo = step(undo, {
    kind: "redo",
  }).state;
  assert.equal(redo.session, undefined);
  assert.deepEqual(selectApplicationView(redo).history.undo, {
    enabled: true,
    label: "Reload image",
  });
});

function step(state, command) {
  return handleApplicationCommand({
    state,
    command,
  });
}

function loadedState({
  pins = [],
  panelIntent,
} = {}) {
  const state = {
    session: {
      mode: "align",
      referenceImage: referenceImage(),
    },
  };
  if (pins.length > 0) {
    state.session.registration = {
      pins,
    };
  }
  if (panelIntent !== undefined) {
    state.panelIntent = panelIntent;
  }
  return state;
}

function referenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}
