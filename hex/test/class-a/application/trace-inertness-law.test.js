import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: Trace is the native-map posture. Overlay placement commands can
// still arrive from stale UI wiring, but they must not mutate hidden state.
test("placement edits are no-ops in Trace mode", () => {
  const state = referenceImageLoadedState({
    mode: "trace",
  });
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    {
      kind: "move",
      placement: {
        x: 80,
        y: 40,
        scale: 1,
        rotationRad: 0,
      },
    },
  );

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

function referenceImageLoadedState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
