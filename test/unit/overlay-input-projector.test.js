import test from "node:test";
import assert from "node:assert/strict";

import {
  createOverlayInputProjector,
} from "../../src/content/overlay/input-projector.js";
import { buildOverlayViewModel } from "../../src/content/overlay/view-model.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import { MACHINE_INPUT_OVERRIDE } from "../../src/core/machine/events.js";
import {
  SESSION_MODE,
  createEmptySession,
} from "../../src/core/session.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { IMAGE as TEST_IMAGE } from "../helpers/session-fixtures.js";

const TEST_SNAPSHOT = Object.freeze({
  viewportRect: { left: 100, top: 200, width: 800, height: 400 },
  localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
  mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
  surfaceMotion: { transformCss: "none", transformOriginCss: "0px 0px" },
});

test("overlay input projector converts DOM client points through page projection", () => {
  const projector = createOverlayInputProjector({
    pageProjection: {
      clientPointToScreen(point) {
        return {
          x: point.x + 1000,
          y: point.y + 2000,
        };
      },
    },
    getOverlayInputContext: () => createOverlayInputContext(),
  });

  assert.deepEqual(projector.screenPointFromEvent({
    clientX: 12,
    clientY: 34,
  }), {
    x: 1012,
    y: 2034,
  });
});

test("overlay input projector owns overlay image hit-testing for input projection", () => {
  const state = createOverlayMachineState();
  const projector = createOverlayInputProjector({
    pageProjection: {
      clientPointToScreen(point) {
        return point;
      },
    },
    getOverlayInputContext: () => createOverlayInputContext(state),
  });

  assert.equal(
    projector.resolveMountedActivationProjection({ x: 512, y: 288 }).shouldTogglePin,
    true,
  );
  assert.equal(
    projector.resolveMountedActivationProjection({ x: 50, y: 50 }).shouldTogglePin,
    false,
  );
});

test("overlay input projector preserves core input policy decisions", () => {
  const state = createOverlayMachineState({
    runtime: {
      ...createInitialMachineState().runtime,
      inputOverride: MACHINE_INPUT_OVERRIDE.PASS_THROUGH,
    },
  });
  const projector = createOverlayInputProjector({
    pageProjection: {
      clientPointToScreen(point) {
        return point;
      },
    },
    getOverlayInputContext: () => createOverlayInputContext(state),
  });

  const projection = projector.resolveMountedActivationProjection({ x: 512, y: 288 });

  assert.equal(projection.shouldTogglePin, false);
});

function createOverlayMachineState({
  mode = SESSION_MODE.ALIGN,
  image = TEST_IMAGE,
  runtime = createInitialMachineState().runtime,
} = {}) {
  return {
    ...createInitialMachineState(),
    runtime,
    session: {
      ...createEmptySession({
        mode,
        image,
        opacity: 0.6,
      }),
      placement: image ? createPlacementTransform({
        image,
        centerMapLatLon: TEST_SNAPSHOT.mapView.center,
        scale: 1,
        rotationRad: 0,
        zoom: TEST_SNAPSHOT.mapView.zoom,
      }) : null,
    },
  };
}

function createOverlayInputContext(state = createOverlayMachineState()) {
  return {
    machineState: state,
    runtime: state.runtime,
    viewModel: buildOverlayViewModel({
      machineState: state,
      runtime: state.runtime,
      snapshot: TEST_SNAPSHOT,
    }),
  };
}
