import test from "node:test";
import assert from "node:assert/strict";

import {
  planMovePlacementEditPreview,
  planMovePlacementEditStart,
  planRotatePlacementEdit,
  planScalePlacementEdit,
  resolvePlacementEditRenderState,
} from "../../src/core/placement-edit-planning.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "../../src/core/machine/events.js";
import {
  createPlacementScreenTransform,
  imagePointToScreenPoint,
  resolveOverlayScreenTransform,
} from "../../src/core/transform.js";

// TODO(smell): Placement-planning tests expect planners to return executable
// machine events. Rewrite them to assert pure geometry facts after placement
// edit interpretation and history/status authoring move into machine ingress.
const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 100,
  height: 50,
});

const PIN_1 = Object.freeze({
  id: 1,
  imagePx: Object.freeze({ x: 10, y: 20 }),
  mapLatLon: Object.freeze({ lat: 1, lon: 2 }),
});

const PIN_2 = Object.freeze({
  id: 2,
  imagePx: Object.freeze({ x: 30, y: 40 }),
  mapLatLon: Object.freeze({ lat: 3, lon: 4 }),
});

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

const SOLVED_TRANSFORM = Object.freeze({
  type: "similarity",
  a: 2,
  b: 0,
  tx: 410,
  ty: 210,
  scale: 2,
  rotationRad: 0,
  pinCount: 2,
});

const SOLVED_PLACEMENT = Object.freeze({
  type: "similarity",
  a: SOLVED_TRANSFORM.a,
  b: SOLVED_TRANSFORM.b,
  tx: SOLVED_TRANSFORM.tx,
  ty: SOLVED_TRANSFORM.ty,
  scale: SOLVED_TRANSFORM.scale,
  rotationRad: SOLVED_TRANSFORM.rotationRad,
});

const SNAPSHOT = Object.freeze({
  viewportRect: Object.freeze({ left: 0, top: 0, width: 800, height: 400 }),
  mapView: Object.freeze({ center: Object.freeze({ lat: 0, lon: 0 }), zoom: 0 }),
});

test("placement edit render state prefers the machine preview placement", () => {
  const previewPlacement = { ...PLACEMENT, tx: 30, ty: 40 };
  const result = resolvePlacementEditRenderState({
    state: {
      session: createSolvedSession(),
      runtime: {
        placementEdit: {
          previewPlacement,
        },
      },
    },
    snapshot: SNAPSHOT,
  });

  assert.equal(result.placement, previewPlacement);
  assert.deepEqual(result.registration, {
    pins: [PIN_1, PIN_2],
    solvedTransform: SOLVED_TRANSFORM,
    dirty: true,
  });
});

test("placement edit render state derives placement from the solved render state", () => {
  const result = resolvePlacementEditRenderState({
    state: createSolvedSession(),
    snapshot: SNAPSHOT,
  });

  assert.deepEqual(result.placement, SOLVED_PLACEMENT);
  assert.deepEqual(result.registration, {
    pins: [PIN_1, PIN_2],
    solvedTransform: SOLVED_TRANSFORM,
    dirty: true,
  });
});

test("placement edit render state falls back to durable placement and rejects missing placement", () => {
  const session = {
    image: IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [PIN_1, PIN_2],
      solvedTransform: SOLVED_TRANSFORM,
      dirty: true,
    },
  };

  assert.equal(
    resolvePlacementEditRenderState({
      state: session,
      snapshot: SNAPSHOT,
    }).placement,
    PLACEMENT,
  );
  assert.equal(
    resolvePlacementEditRenderState({
      state: {
        ...session,
        placement: null,
      },
      snapshot: SNAPSHOT,
    }),
    null,
  );
});

test("placement edit planner creates move begin and preview events", () => {
  const state = createSolvedSession();
  const editState = resolvePlacementEditRenderState({
    state,
    snapshot: SNAPSHOT,
  });
  const editTransform = resolveOverlayScreenTransform({
    state: editState,
    snapshot: SNAPSHOT,
  });
  const imageCenter = { x: IMAGE.width / 2, y: IMAGE.height / 2 };
  const startCenterScreenPx = imagePointToScreenPoint({
    imagePoint: imageCenter,
    transform: editTransform,
  });
  const startPointerScreenPx = { x: 500, y: 250 };
  const start = planMovePlacementEditStart({
    state,
    snapshot: SNAPSHOT,
    startPointerScreenPx,
  });

  assertPointClose(start.startCenterScreenPx, startCenterScreenPx);
  assert.deepEqual(start.event, {
    type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
    renderedPlacement: SOLVED_PLACEMENT,
  });

  const preview = planMovePlacementEditPreview({
    state,
    snapshot: SNAPSHOT,
    startPointerScreenPx,
    startCenterScreenPx: start.startCenterScreenPx,
    pointerScreenPx: { x: 520, y: 270 },
  });
  const previewTransform = createPlacementScreenTransform({
    snapshot: SNAPSHOT,
    placement: preview.event.placement,
  });
  const movedCenterScreenPx = imagePointToScreenPoint({
    imagePoint: imageCenter,
    transform: previewTransform,
  });

  assert.equal(preview.event.type, MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT);
  assertPointClose(movedCenterScreenPx, {
    x: startCenterScreenPx.x + 20,
    y: startCenterScreenPx.y + 20,
  });
});

test("placement edit planner creates anchored rotate and scale edit events", () => {
  const state = createSolvedSession();
  const editState = resolvePlacementEditRenderState({
    state,
    snapshot: SNAPSHOT,
  });
  const anchorImagePx = { x: 60, y: 25 };
  const anchorScreenPx = imagePointToScreenPoint({
    imagePoint: anchorImagePx,
    transform: resolveOverlayScreenTransform({
      state: editState,
      snapshot: SNAPSHOT,
    }),
  });

  const rotate = planRotatePlacementEdit({
    state,
    snapshot: SNAPSHOT,
    anchorScreenPx,
    deltaY: -100,
  });
  assert.equal(rotate.event.type, MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT);
  assert.equal(rotate.event.editKind, MACHINE_PLACEMENT_EDIT_KIND.ROTATE);
  assert.deepEqual(rotate.event.renderedPlacement, SOLVED_PLACEMENT);
  assert.ok(rotate.rotationRad > 0);
  assertPlacementKeepsAnchor(rotate.event.placement, anchorImagePx, anchorScreenPx);

  const scale = planScalePlacementEdit({
    state,
    snapshot: SNAPSHOT,
    anchorScreenPx,
    deltaY: -100,
  });
  assert.equal(scale.event.type, MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT);
  assert.equal(scale.event.editKind, MACHINE_PLACEMENT_EDIT_KIND.SCALE);
  assert.deepEqual(scale.event.renderedPlacement, SOLVED_PLACEMENT);
  assert.ok(scale.scale > Math.hypot(SOLVED_PLACEMENT.a, SOLVED_PLACEMENT.b));
  assertPlacementKeepsAnchor(scale.event.placement, anchorImagePx, anchorScreenPx);
});

function createSolvedSession() {
  return {
    image: IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [PIN_1, PIN_2],
      solvedTransform: SOLVED_TRANSFORM,
      dirty: false,
    },
  };
}

function assertPlacementKeepsAnchor(placement, anchorImagePx, anchorScreenPx) {
  const screenTransform = createPlacementScreenTransform({
    snapshot: SNAPSHOT,
    placement,
  });
  assertPointClose(
    imagePointToScreenPoint({
      imagePoint: anchorImagePx,
      transform: screenTransform,
    }),
    anchorScreenPx,
  );
}

function assertPointClose(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9);
}
