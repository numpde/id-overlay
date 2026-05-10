import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: committed Align placement edits are the durable overlay transform.
// Move, rotate, and scale may originate from different gestures, but once
// committed they all update session placement and persist exactly that session.
test("committed Align placement edits update placement durably", () => {
  for (const { editKind, placement } of [
    {
      editKind: "move",
      placement: movedPlacement(),
    },
    {
      editKind: "rotate",
      placement: rotatedPlacement(),
    },
    {
      editKind: "scale",
      placement: scaledPlacement(),
    },
  ]) {
    const result = handleApplicationCommand({
      state: referenceImageLoadedState(),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
        placementEditPayload({ editKind, placement }),
      ),
    });

    assert.deepEqual(result, {
      state: referenceImageLoadedState({ placement }),
      effects: [
        durableStateChangedEffect(referenceImageDurableState({ placement })),
      ],
    });
  }
});

// Class-a: committed placement is durable overlay state. Hydration must restore
// it into the visible session rather than treating placement as write-only
// storage.
test("durable committed placement hydrates into the session", () => {
  const durableState = referenceImageDurableState({
    placement: movedPlacement(),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState,
    }),
  }), {
    state: referenceImageLoadedState({
      placement: movedPlacement(),
    }),
    effects: [],
  });
});

function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}

function rotatedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0.5,
  };
}

function scaledPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1.5,
    rotationRad: 0,
  };
}

function placementEditPayload({ editKind, placement }) {
  return {
    editKind,
    placement,
  };
}

function referenceImageLoadedState({ placement } = {}) {
  const session = normalizedReferenceImageSession();
  if (placement !== undefined) {
    session.placement = placement;
  }
  return {
    session,
  };
}

function referenceImageDurableState({ placement } = {}) {
  return {
    session: referenceImageLoadedState({ placement }).session,
  };
}

function normalizedReferenceImageSession() {
  return {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
}

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
