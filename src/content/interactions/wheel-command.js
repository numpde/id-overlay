import {
  isKnownWheelMode,
  WHEEL_MODE,
} from "../../core/interaction-policy.js";
import {
  planRotatePlacementEdit,
  planScalePlacementEdit,
} from "../../core/placement-edit-planning.js";
import {
  opacityFromWheelDelta,
  resolveOverlayRenderSource,
} from "../../core/transform.js";
import { MACHINE_EVENT_KIND } from "../../core/machine/events.js";

export function createWheelCommand({
  pageAdapter,
  getMachineState,
  dispatchMachine,
}) {
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
    const forwarded = pageAdapter.forwardMapZoom({
      screenPoint,
      deltaY,
    });
    if (!forwarded) {
      return createUnhandledOutcome("map-zoom-not-forwarded", {
        log: {
          level: "warn",
          message: "Map zoom requested, but the page adapter could not forward it",
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
    const nextOpacity = opacityFromWheelDelta(getMachineState().session.opacity, deltaY);
    dispatchMachine({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity: nextOpacity,
    });
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
    const snapshot = pageAdapter.getSnapshot();
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
      state: getMachineState(),
      snapshot,
      anchorScreenPx: screenPoint,
      deltaY,
    });
    if (!rotatePlan) {
      return createUnhandledOutcome("no-placement");
    }
    dispatchMachine(rotatePlan.event);
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
      state: getMachineState(),
      snapshot,
      anchorScreenPx: screenPoint,
      deltaY,
    });
    if (!scalePlan) {
      return createUnhandledOutcome("no-placement");
    }
    dispatchMachine(scalePlan.event);
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
