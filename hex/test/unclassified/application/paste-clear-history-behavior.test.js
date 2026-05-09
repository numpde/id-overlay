import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";

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
  panelIntent,
} = {}) {
  const state = {
    session: {
      mode: "align",
      referenceImage: referenceImage(),
    },
  };
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
