import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified candidate: selecting Trace is the product moment that asks for
// an auto-fit. The app/domain own that causality; the shell must not pre-solve
// and smuggle placement into `select-mode`. The durable fact is the selected fit
// source, not duplicated solve coefficients that can already be derived from
// the pins.
test("selecting Trace with solve-ready pins records an undoable registration fit", () => {
  const beforeState = referenceImageLoadedState({
    mode: "align",
    pins: [firstPin(), secondPin()],
  });
  const afterSession = {
    ...beforeState.session,
    mode: "trace",
    registration: {
      pins: [firstPin(), secondPin()],
      fit: {
        kind: "from-pins",
        pinIds: [1, 2],
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state: beforeState,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: {
      session: afterSession,
      notice: {
        kind: "registration-fit-succeeded",
        pinCount: 2,
        requestId: 1,
      },
      history: {
        past: [{
          kind: "fit-registration",
          before: {
            session: beforeState.session,
          },
          after: {
            session: afterSession,
          },
        }],
        future: [],
      },
    },
    effects: [
      persistDurableStateEffect({
        session: afterSession,
      }),
      scheduleClearStatusNoticeEffect(1),
    ],
  });
});

// Unclassified candidate: failed fitting must be visible but not durable. Trace
// remains a valid mode selection, the current placement is not fabricated, and
// no history entry is recorded because no fit happened.
test("failed registration fit enters Trace without fabricating solved placement", () => {
  const beforeState = referenceImageLoadedState({
    mode: "align",
    pins: [degenerateFirstPin(), degenerateSecondPin()],
  });
  const afterSession = {
    ...beforeState.session,
    mode: "trace",
  };

  assert.deepEqual(handleApplicationCommand({
    state: beforeState,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: {
      session: afterSession,
      notice: {
        kind: "registration-fit-failed",
        reason: "degenerate-pins",
        pinIds: [1, 2],
        requestId: 1,
      },
    },
    effects: [
      persistDurableStateEffect({
        session: afterSession,
      }),
      scheduleClearStatusNoticeEffect(1),
    ],
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
      x: 0,
      y: 0,
    },
    mapLatLon: {
      lat: 0,
      lon: -180,
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
    mapLatLon: {
      lat: 0,
      lon: -178.59375,
    },
  };
}

function degenerateFirstPin() {
  return {
    ...firstPin(),
    imagePx: {
      x: 10,
      y: 10,
    },
  };
}

function degenerateSecondPin() {
  return {
    ...secondPin(),
    imagePx: {
      x: 10,
      y: 10,
    },
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

function scheduleClearStatusNoticeEffect(requestId) {
  return {
    kind: "schedule-clear-status-notice",
    requestId,
    delayMs: 2500,
  };
}
