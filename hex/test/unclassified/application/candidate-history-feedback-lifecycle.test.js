import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";

// Unclassified candidate: the legacy panel made the initial image load
// undoable. Keep this as a candidate because current class-a laws deliberately
// avoid saying whether an initial load should enter history.
test("initial reference-image load is undoable and undo clears stale confirmation", () => {
  const loadResult = handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "load-reference-image",
        },
      },
    },
    command: acceptedReferenceImageCommand(),
  });
  const record = loadResult.state.history?.past?.at(-1);

  assert.deepEqual(record, loadImageHistoryRecord());

  const confirmResult = handleApplicationCommand({
    state: loadResult.state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  });
  const undoResult = handleApplicationCommand({
    state: confirmResult.state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.equal(Object.hasOwn(undoResult.state, "panelIntent"), false);
  assert.deepEqual(undoResult.state.history, {
    past: [],
    future: [record],
  });
  assert.equal(selectApplicationView(undoResult.state).primaryAction.label, "Paste");
});

// Unclassified candidate: the legacy panel reported successful history actions
// to the user. The exact copy should stay negotiable, but some transient
// user-visible feedback prevents undo/redo from feeling like silent state jumps.
test("undo and redo expose transient history feedback", () => {
  const record = loadImageHistoryRecord();

  const undoResult = handleApplicationCommand({
    state: {
      ...loadedState(),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.match(selectApplicationView(undoResult.state).status, /\bundid\b/i);

  const redoResult = handleApplicationCommand({
    state: undoResult.state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
  });

  assert.match(selectApplicationView(redoResult.state).status, /\bredid\b/i);
});

function loadImageHistoryRecord() {
  return {
    kind: "load-reference-image",
    before: null,
    after: loadedDurableState(),
  };
}

function acceptedReferenceImageCommand() {
  return createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    {
      requestId: 1,
      outcome: {
        kind: "accepted",
        referenceImage: loadedDurableState().session.referenceImage,
      },
    },
  );
}

function loadedState() {
  return {
    session: loadedDurableState().session,
  };
}

function loadedDurableState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "image-data-ref:history",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
