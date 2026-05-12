import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: placement undo is scoped replay over the current session, not full
// session rollback. Mode, opacity, pins, and reference identity are unrelated to
// a move record and must survive undo even if they changed after the edit.
test("undoing placement preserves unrelated current durable state", () => {
  const record = placementHistoryRecord({
    editKind: "move",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: null,
    }),
    after: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "trace",
        opacity: 0.5,
        pins: [firstPin()],
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  }), {
    state: {
      session: referenceImageSession({
        mode: "trace",
        opacity: 0.5,
        pins: [firstPin()],
        placement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [{
      kind: "persist-durable-state",
      durableState: durableImageState({
        mode: "trace",
        opacity: 0.5,
        pins: [firstPin()],
        placement: originalPlacement(),
      }),
    }],
  });
});

function placementHistoryRecord({ editKind, before, after }) {
  return {
    kind: "overlay-placement-edit",
    editKind,
    before,
    after,
  };
}

function placementRevision({ placement, solvedRegistration }) {
  return {
    placement,
    solvedRegistration,
  };
}

function durableImageState({
  mode,
  placement,
  opacity,
  pins,
}) {
  return {
    session: referenceImageSession({
      mode,
      placement,
      opacity,
      pins,
    }),
  };
}

function referenceImageSession({
  mode,
  placement = undefined,
  opacity = undefined,
  pins = [],
}) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "data:image/png;base64,reference-image",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  return session;
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

function originalPlacement() {
  return placement({
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0,
  });
}

function movedPlacement() {
  return placement({
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0,
  });
}

function placement({
  x,
  y,
  scale,
  rotationRad,
}) {
  return {
    x,
    y,
    scale,
    rotationRad,
  };
}
