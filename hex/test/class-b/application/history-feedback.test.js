import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";

// Class-b, deliberately not class-a: exact undo/redo status copy is negotiable.
// The stable user-facing boundary is that successful history replay is not a
// silent state jump; the view exposes transient feedback for the completed
// history action.
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
