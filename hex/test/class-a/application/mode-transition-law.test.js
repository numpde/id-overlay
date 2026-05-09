import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: selecting the current loaded mode is a semantic no-op. It must not
// create persistence work, history entries, notices, or a different state.
test("re-selecting the current loaded mode is a no-op", () => {
  for (const mode of ["align", "trace"]) {
    const state = referenceImageLoadedState({ mode });
    const command = createApplicationCommand(
      APPLICATION_COMMAND_KIND.SELECT_MODE,
      { mode },
    );

    assert.deepEqual(handleApplicationCommand({ state, command }), {
      state,
      effects: [],
    });
  }
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
