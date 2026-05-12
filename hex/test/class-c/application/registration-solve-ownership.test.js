import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-c: the user-visible outcome is right, but the ownership shape is not
// settled enough for authority. Selecting Trace with enough registration facts
// should fit the overlay. This candidate makes `select-mode` perform the solve
// synchronously inside the application, which would be ideal only if the stored
// registration facts already lived in the same coordinate frame as placement.
// Today durable pins use map coordinates while placement is viewport-relative,
// so the no-regret design likely needs either current projection facts in the
// command or a declared fit effect/result pair. Do not promote this exact test
// until that boundary is decided.
test("selecting Trace solves registration inside application", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  });

  assert.deepEqual(result, {
    state: {
      session: {
        mode: "trace",
        referenceImage: normalizedReferenceImage(),
        placement: solvedPlacement(),
        registration: {
          pins: [firstPin(), secondPin()],
          solvedPlacement: solvedPlacement(),
        },
      },
      notice: {
        kind: "fit-reference-image-from-pins",
        pinCount: 2,
      },
    },
    effects: [{
      kind: "persist-durable-state",
      durableState: {
        session: {
          mode: "trace",
          referenceImage: normalizedReferenceImage(),
          placement: solvedPlacement(),
          registration: {
            pins: [firstPin(), secondPin()],
            solvedPlacement: solvedPlacement(),
          },
        },
      },
    }],
  });
});

function referenceImageLoadedState({ mode, pins }) {
  return {
    session: {
      mode,
      referenceImage: normalizedReferenceImage(),
      registration: {
        pins,
      },
    },
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
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
      x: 0,
      y: 0,
    },
    mapPx: {
      x: 100,
      y: 200,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 100,
      y: 0,
    },
    mapPx: {
      x: 200,
      y: 200,
    },
  };
}

function solvedPlacement() {
  return {
    x: 100,
    y: 200,
    scale: 1,
    rotationRad: 0,
  };
}
