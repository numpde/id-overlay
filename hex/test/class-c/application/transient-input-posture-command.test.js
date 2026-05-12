import test from "node:test";
import assert from "node:assert/strict";

import {
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectDurableApplicationState } from "../../../application/view-model.js";

const SET_TEMPORARY_INPUT_POSTURE = "set-temporary-input-posture";

// Class-c: proposal for transient input posture ownership.
//
// Decision pressure: temporary native-map access might need to be a semantic
// application transition, not browser-local state and not durable product mode.
// Current command vocabulary does not include this transition, so the test is
// quarantined until the input-posture SSoT is settled end-to-end.
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

// Class-c: proposed boundary payload. It deliberately rejects `active: true`,
// `spacePressed`, and other input-device vocabulary, but the command itself is
// not part of the accepted application vocabulary yet.
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
