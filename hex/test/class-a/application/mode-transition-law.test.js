import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: once an image is loaded, Trace is a real durable user mode. Changing
// to Trace updates the saved session posture rather than merely toggling view.
test("switching loaded image from Align to Trace changes mode durably", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "trace",
  });

  assert.deepEqual(handleApplicationCommand({
    state: referenceImageLoadedState({ mode: "align" }),
    command,
  }), {
    state: referenceImageLoadedState({ mode: "trace" }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
});

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

function referenceImageDurableState({ mode }) {
  return {
    session: referenceImageLoadedState({ mode }).session,
  };
}

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
