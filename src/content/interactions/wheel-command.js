import {
  isKnownWheelMode,
  WHEEL_MODE,
} from "../../core/interaction-policy.js";
import { resolvePlacementEditRenderState } from "../../core/placement-edit-render-state.js";
import {
  createRetunedPlacementTransform,
  opacityFromWheelDelta,
  resolveOverlayRenderSource,
  rotationFromWheelDelta,
  scaleFromWheelDelta,
} from "../../core/transform.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "../../core/machine/events.js";

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
    const placementState = resolvePlacementEditRenderState({
      state: getMachineState(),
      snapshot,
    });
    if (!placementState) {
      return createUnhandledOutcome("no-placement");
    }
    if (wheelMode === WHEEL_MODE.ROTATE_OVERLAY) {
      return handleRotateWheel({ deltaY, screenPoint, snapshot, placementState });
    }
    if (wheelMode === WHEEL_MODE.ZOOM_OVERLAY) {
      return handleScaleWheel({ deltaY, screenPoint, snapshot, placementState });
    }
    return createUnhandledOutcome("unsupported-placement-wheel-mode");
  }

  function handleRotateWheel({ deltaY, screenPoint, snapshot, placementState }) {
    const nextRotationRad = rotationFromWheelDelta(placementState.placement.rotationRad, deltaY);
    const nextPlacement = createRetunedPlacementTransform({
      state: placementState,
      snapshot,
      anchorScreenPx: screenPoint,
      rotationRad: nextRotationRad,
    });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
      renderedPlacement: placementState.placement,
      placement: nextPlacement,
      editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
    });
    return createHandledOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Rotated overlay placement",
        details: { rotationRad: nextRotationRad, deltaY },
      },
    });
  }

  function handleScaleWheel({ deltaY, screenPoint, snapshot, placementState }) {
    const screenScale = Math.hypot(
      placementState.placement.a,
      placementState.placement.b,
    ) * (2 ** snapshot.mapView.zoom);
    const nextScale = scaleFromWheelDelta(screenScale, deltaY);
    const nextPlacement = createRetunedPlacementTransform({
      state: placementState,
      snapshot,
      anchorScreenPx: screenPoint,
      screenScale: nextScale,
    });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
      renderedPlacement: placementState.placement,
      placement: nextPlacement,
      editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
    });
    return createHandledOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Scaled overlay placement",
        details: { scale: nextScale, deltaY },
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
