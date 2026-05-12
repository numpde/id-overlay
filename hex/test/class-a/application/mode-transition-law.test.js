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
      persistDurableStateEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
});

// Class-a: Align is the inverse durable loaded-image mode. Returning to it is
// not an adapter-local toggle; it changes the saved session posture.
test("switching loaded image from Trace to Align changes mode durably", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "align",
  });

  assert.deepEqual(handleApplicationCommand({
    state: referenceImageLoadedState({ mode: "trace" }),
    command,
  }), {
    state: referenceImageLoadedState({ mode: "align" }),
    effects: [
      persistDurableStateEffect(referenceImageDurableState({ mode: "align" })),
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

// Class-a: switching mode interrupts any in-progress placement draft. The
// durable mode changes, but the uncommitted preview is discarded instead of
// being saved or carried into the next mode.
test("interrupted placement edit drops preview without changing durable session", () => {
  const state = {
    ...referenceImageLoadedState({ mode: "align" }),
    placementPreview: {
      beforePlacement: null,
      previewPlacement: {
        x: 80,
        y: 40,
        scale: 1,
        rotationRad: 0,
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: referenceImageLoadedState({ mode: "trace" }),
    effects: [
      persistDurableStateEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
});

// Class-a: destructive confirmations are tied to the current visible intention.
// A different semantic action must clear the armed confirmation so a stale
// second-click cannot perform a destructive action later.
test("mode switching clears pending destructive confirmation", () => {
  assert.deepEqual(handleApplicationCommand({
    state: {
      ...referenceImageLoadedState({ mode: "align" }),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: referenceImageLoadedState({ mode: "trace" }),
    effects: [
      persistDurableStateEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
});

// Class-a: selecting Trace must never fabricate a placement. Fitting is a
// separate semantic consequence of a successful registration solve; with only
// unsolved pins, Trace changes durable mode and preserves registration for a
// later return to Align.
test("switching to Trace without a solved registration changes mode only", () => {
  const state = referenceImageLoadedState({
    mode: "align",
    pins: [firstPin()],
  });
  const expectedState = referenceImageLoadedState({
    mode: "trace",
    pins: [firstPin()],
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: expectedState,
    effects: [
      persistDurableStateEffect({
        session: expectedState.session,
      }),
    ],
  });
});

function referenceImageLoadedState({ mode, pins = [] }) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

function referenceImageDurableState({ mode }) {
  return {
    session: referenceImageLoadedState({ mode }).session,
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}
