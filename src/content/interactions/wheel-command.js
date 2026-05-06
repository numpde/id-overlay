import {
  isKnownWheelMode,
  WHEEL_MODE,
} from "../../core/interaction-policy.js";
import {
  planRotatePlacementEdit,
  planScalePlacementEdit,
} from "../../core/placement-edit-planning.js";
import {
  resolveOverlayRenderSource,
} from "../../core/transform.js";

export function createWheelCommand({
  pageObservation,
  mapGesture,
  getMachineState,
  machineActions,
}) {
  // TODO(smell): Wheel handling mixes map forwarding, opacity updates, and
  // placement edits under one command. Split by wheel mode after panel opacity
  // and overlay wheel edits share one command vocabulary.
  return {
    handleWheel,
  };

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    if (!isKnownWheelMode(wheelMode)) {
      return createUnhandledOutcome("unknown-wheel-mode");
    }
    if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
      return handleMapZoomWheel({ deltaY, screenPoint });
    }
    if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
      return handleOpacityWheel({ deltaY, screenPoint });
    }
    return handlePlacementWheel({ deltaY, wheelMode, screenPoint });
  }

  function handleMapZoomWheel({ deltaY, screenPoint }) {
    const forwarded = mapGesture.forwardMapZoom({
      screenPoint,
      deltaY,
    });
    if (!forwarded) {
      return createUnhandledOutcome("map-zoom-not-forwarded", {
        log: {
          level: "warn",
          message: "Map zoom requested, but the map gesture port could not forward it",
        },
      });
    }
    return createHandledOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Forwarded native wheel to map zoom; overlay follows through the current render state",
        details: {
          forwarded,
          deltaY,
          renderSource: resolveOverlayRenderSource(getMachineState().session),
        },
      },
    });
  }

  function handleOpacityWheel({ deltaY, screenPoint }) {
    const result = machineActions.changeOpacityByWheel({ deltaY });
    const nextOpacity = result.state.session.opacity;
    return createHandledOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Adjusted overlay opacity",
        details: { opacity: nextOpacity, deltaY },
      },
    });
  }

  function handlePlacementWheel({ deltaY, wheelMode, screenPoint }) {
    const snapshot = pageObservation.getSnapshot();
    if (wheelMode === WHEEL_MODE.ROTATE_OVERLAY) {
      return handleRotateWheel({ deltaY, screenPoint, snapshot });
    }
    if (wheelMode === WHEEL_MODE.ZOOM_OVERLAY) {
      return handleScaleWheel({ deltaY, screenPoint, snapshot });
    }
    return createUnhandledOutcome("unsupported-placement-wheel-mode");
  }

  function handleRotateWheel({ deltaY, screenPoint, snapshot }) {
    const rotatePlan = planRotatePlacementEdit({
      machineState: getMachineState(),
      snapshot,
      anchorScreenPx: screenPoint,
      deltaY,
    });
    if (!rotatePlan) {
      return createUnhandledOutcome("no-placement");
    }
    machineActions.rotateOverlayPlacement(rotatePlan);
    return createHandledOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Rotated overlay placement",
        details: { rotationRad: rotatePlan.rotationRad, deltaY },
      },
    });
  }

  function handleScaleWheel({ deltaY, screenPoint, snapshot }) {
    const scalePlan = planScalePlacementEdit({
      machineState: getMachineState(),
      snapshot,
      anchorScreenPx: screenPoint,
      deltaY,
    });
    if (!scalePlan) {
      return createUnhandledOutcome("no-placement");
    }
    machineActions.scaleOverlayPlacement(scalePlan);
    return createHandledOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Scaled overlay placement",
        details: { scale: scalePlan.scale, deltaY },
      },
    });
  }
}

function createHandledOutcome({ pointerScreenPx, log }) {
  return {
    handled: true,
    pointerScreenPx,
    log,
  };
}

function createUnhandledOutcome(reason, { log = null } = {}) {
  return {
    handled: false,
    reason,
    log,
  };
}
