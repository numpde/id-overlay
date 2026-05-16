import {
  labelDebugNode,
} from "./debug-label.js";
import {
  isExtensionOwnedNode,
} from "./native-map-owned-target.js";

const NATIVE_MAP_DRAG_THRESHOLD_PX = 8;

export function createNativeMapWheelSuppression({
  document,
  ownerWindow,
  eventDebugLogger,
}) {
  let forwardedPanActive = false;
  let directPan = null;

  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("pointerup", clearDirectPan, true);
  document.addEventListener("pointercancel", clearDirectPan, true);
  ownerWindow.addEventListener("pointermove", handlePointerMove, true);
  ownerWindow.addEventListener("pointerup", clearDirectPan, true);
  ownerWindow.addEventListener("pointercancel", clearDirectPan, true);
  document.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });

  return {
    noteForwardedNativeMapGesture(fact) {
      if (fact.gestureKind !== "pan") {
        return;
      }
      if (fact.phase === "start" || fact.phase === "move") {
        forwardedPanActive = true;
      }
      if (fact.phase === "end") {
        forwardedPanActive = false;
      }
      eventDebugLogger?.log("native-map.pan-state", "forwarded-pan-phase", {
        phase: fact.phase,
        forwardedPanActive,
        screenPx: fact.screenPx,
      });
    },
    readDebugState() {
      return {
        forwardedPanActive,
        directPanActive: Boolean(directPan?.active),
        directPanPending: Boolean(directPan && !directPan.active),
        directPanAnchorScreenPx: directPan?.anchorScreenPx,
      };
    },
  };

  function handlePointerDown(event) {
    if (event.__idOverlayForwardedNativeMap || event.button !== 0 || isExtensionOwnedEvent(event)) {
      return;
    }
    directPan = {
      active: false,
      pointerId: event.pointerId,
      anchorScreenPx: screenPxFromEvent(event),
    };
    eventDebugLogger?.log("native-map.pan-state", "direct-pan-pending", {
      pointerId: event.pointerId,
      anchorScreenPx: directPan.anchorScreenPx,
      target: labelDebugNode(event.target),
    });
  }

  function handlePointerMove(event) {
    if (event.__idOverlayForwardedNativeMap || !directPan || !matchesDirectPanPointer(event)) {
      return;
    }
    const distancePx = vectorLength(subtractScreenPx(
      screenPxFromEvent(event),
      directPan.anchorScreenPx,
    ));
    if (!directPan.active && distancePx >= NATIVE_MAP_DRAG_THRESHOLD_PX) {
      directPan.active = true;
      eventDebugLogger?.log("native-map.pan-state", "direct-pan-active", {
        pointerId: event.pointerId,
        distancePx,
        thresholdPx: NATIVE_MAP_DRAG_THRESHOLD_PX,
        screenPx: screenPxFromEvent(event),
      });
      return;
    }
    if (!directPan.active) {
      eventDebugLogger?.log("native-map.pan-state", "direct-pan-below-threshold", {
        pointerId: event.pointerId,
        distancePx,
        thresholdPx: NATIVE_MAP_DRAG_THRESHOLD_PX,
      });
    }
  }

  function clearDirectPan(event) {
    if (event.__idOverlayForwardedNativeMap || !directPan || !matchesDirectPanPointer(event)) {
      return;
    }
    eventDebugLogger?.log("native-map.pan-state", "direct-pan-end", {
      pointerId: event.pointerId,
      directPanActive: Boolean(directPan.active),
      screenPx: screenPxFromEvent(event),
    });
    directPan = null;
  }

  function handleWheel(event) {
    if (!forwardedPanActive && !directPan?.active) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    eventDebugLogger?.log("native-map", "wheel-suppressed-during-pan", {
      forwardedPanActive,
      directPanActive: Boolean(directPan?.active),
    });
  }

  function matchesDirectPanPointer(event) {
    return directPan.pointerId === undefined
      || event.pointerId === undefined
      || event.pointerId === directPan.pointerId;
  }
}

function isExtensionOwnedEvent(event) {
  return event.composedPath?.().some((node) => isExtensionOwnedNode(node)) ?? isExtensionOwnedNode(event.target);
}

function screenPxFromEvent(event) {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function subtractScreenPx(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}
