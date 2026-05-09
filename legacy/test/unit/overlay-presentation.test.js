import test from "node:test";
import assert from "node:assert/strict";

import { buildOverlayPresentation } from "../../src/content/overlay/presentation.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import {
  SESSION_MODE,
  createEmptySession,
} from "../../src/core/session.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { IMAGE } from "../helpers/session-fixtures.js";

test("overlay presentation builds one shared machine/runtime/snapshot/view-model bundle", () => {
  const machineState = createOverlayMachineState();
  const runtime = machineState.runtime;
  const snapshot = createSnapshot();

  const presentation = buildOverlayPresentation({
    machineState,
    runtime,
    snapshot,
    projectMapPinScreenPoint({ lat, lon }) {
      return { x: lon, y: lat };
    },
  });

  assert.equal(Object.isFrozen(presentation), true);
  assert.equal(presentation.machineState, machineState);
  assert.equal(presentation.runtime, runtime);
  assert.equal(presentation.snapshot, snapshot);
  assert.equal(presentation.viewModel.viewport.rect, snapshot.localViewportRect);
});

function createOverlayMachineState() {
  const snapshot = createSnapshot();
  return createInitialMachineState({
    session: {
      ...createEmptySession({
        mode: SESSION_MODE.ALIGN,
        image: IMAGE,
        opacity: 0.6,
      }),
      placement: createPlacementTransform({
        image: IMAGE,
        centerMapLatLon: snapshot.mapView.center,
        scale: 1,
        rotationRad: 0,
        zoom: snapshot.mapView.zoom,
      }),
    },
  });
}

function createSnapshot() {
  return {
    mountElement: { id: "mount-1" },
    viewportRect: { left: 100, top: 200, width: 800, height: 400 },
    localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
    mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 0, 0)",
      transformOriginCss: "0px 0px",
    },
  };
}
