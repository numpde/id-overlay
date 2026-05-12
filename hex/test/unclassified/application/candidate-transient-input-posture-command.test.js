import test from "node:test";
import assert from "node:assert/strict";

import {
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectDurableApplicationState } from "../../../application/view-model.js";

const SET_TEMPORARY_INPUT_POSTURE = "set-temporary-input-posture";

// Unclassified: proposal for transient input posture ownership.
//
// Decision encoded here: temporary native-map access is a semantic application
// transition, not browser-local state and not durable product mode. The browser
// may observe a key press, but the app owns the visible posture because the
// posture affects panel/overlay rendering and must have one SSoT.
test("candidate: temporary input posture is application-owned and non-durable", () => {
  const initialState = referenceImageLoadedState({
    mode: "align",
  });

  const enter = handleApplicationCommand({
    state: initialState,
    command: createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
      posture: "native-map",
    }),
  });
  assert.deepEqual(enter.state, {
    ...initialState,
    inputOverride: {
      kind: "temporary-native-map-access",
    },
  });
  assert.deepEqual(enter.effects, []);
  assert.deepEqual(selectDurableApplicationState(enter.state), initialState);

  const exit = handleApplicationCommand({
    state: enter.state,
    command: createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
      posture: "normal",
    }),
  });
  assert.deepEqual(exit.state, initialState);
  assert.deepEqual(exit.effects, []);
});

// Unclassified: proposal for the boundary payload. This deliberately rejects
// `active: true`, `spacePressed`, and other input-device vocabulary. The command
// names the product posture requested after browser mechanics have been mapped
// away.
test("candidate: temporary input posture command accepts only semantic posture payloads", () => {
  assert.deepEqual(createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
    posture: "native-map",
  }), {
    kind: SET_TEMPORARY_INPUT_POSTURE,
    posture: "native-map",
  });
  assert.deepEqual(createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
    posture: "normal",
  }), {
    kind: SET_TEMPORARY_INPUT_POSTURE,
    posture: "normal",
  });

  for (const payload of [
    {},
    {
      active: true,
    },
    {
      key: "Space",
    },
    {
      posture: "trace",
    },
  ]) {
    assert.throws(() => createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, payload));
  }
});

function referenceImageLoadedState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
