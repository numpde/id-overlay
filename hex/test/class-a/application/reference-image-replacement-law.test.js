import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";

// Class-a: replacing a loaded reference image is not "clear, then paste".
// The old session remains the visible durable product fact until a new
// normalized reference-image input is accepted. This keeps failed, empty, stale,
// or cancelled input non-destructive no matter which input adapter supplied it.
test("requesting replacement keeps the current image while awaiting input", () => {
  const state = {
    ...loadedImageState({
      mode: "trace",
      placement: oldPlacement(),
      pins: [firstPin()],
      opacity: 0.5,
    }),
    notice: {
      kind: "stale-notice",
    },
    panelIntent: {
      kind: "confirm-clear-reference-image",
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }), {
    state: {
      session: state.session,
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    effects: [{
      kind: "request-reference-image-input",
      requestId: 1,
    }],
  });
});

// Class-a: no-session replacement must not create a hidden alternate input
// path. With no image loaded, the product has only the ordinary initial input
// action; synthetic replacement commands are stale and therefore inert.
test("replacement request with no image is inert", () => {
  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }), {
    state: {},
    effects: [],
  });
});

// Class-a: pending replacement is a transient input state layered over the old
// session. The view must still render the old overlay facts; otherwise a failed
// or cancelled replacement would already have behaved like removal.
test("replacement-pending view still renders the old image", () => {
  const state = {
    ...loadedImageState({
      mode: "align",
      placement: oldPlacement(),
      pins: [firstPin()],
    }),
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 1,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };

  const view = selectApplicationView(state);

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: oldReferenceImage().imageDataRef,
    intrinsicSizePx: oldReferenceImage().intrinsicSizePx,
    placement: oldPlacement(),
    opacity: 1,
    pins: [firstPin()],
  });
  assert.match(view.primaryAction.label, /cancel/i);
  assert.doesNotMatch(view.primaryAction.label, /clear/i);
});

function loadedImageState({
  mode = "align",
  referenceImage = oldReferenceImage(),
  placement = undefined,
  pins = [],
  opacity = undefined,
} = {}) {
  const session = {
    mode,
    referenceImage,
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  return {
    session,
  };
}

function oldReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,old-reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function oldPlacement() {
  return {
    x: 30,
    y: 40,
    scale: 1.5,
    rotationRad: 0.25,
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
