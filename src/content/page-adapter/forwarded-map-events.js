export const FORWARDED_MAP_GESTURE_EVENT_FLAG = "idOverlayForwardedMapGesture";

// TODO(smell): Forwarding relies on synthetic DOM events matching iD's native
// handlers closely enough. Keep construction quarantined here and cover browser
// compatibility before widening supported gestures.
export function isForwardedMapGestureEvent(event) {
  return event?.[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true;
}

export function dispatchForwardedMapPointerPhase({ context, target, type, clientPoint }) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX: clientPoint.x,
    clientY: clientPoint.y,
    screenX: clientPoint.x,
    screenY: clientPoint.y,
    button: 0,
    buttons: type === "up" ? 0 : 1,
    view: context.mapWindow,
  };

  if (typeof context.mapWindow.PointerEvent === "function") {
    const pointerType = type === "down" ? "pointerdown" : type === "move" ? "pointermove" : "pointerup";
    dispatchForwardedMapEvent(new context.mapWindow.PointerEvent(pointerType, {
      ...eventInit,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }), target);
  }

  const mouseType = type === "down" ? "mousedown" : type === "move" ? "mousemove" : "mouseup";
  dispatchForwardedMapEvent(new context.mapWindow.MouseEvent(mouseType, eventInit), target);
}

export function dispatchForwardedMapWheel({
  context,
  target,
  clientPoint,
  deltaX = 0,
  deltaY = 0,
  deltaMode = 0,
}) {
  dispatchForwardedMapEvent(new context.mapWindow.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: clientPoint.x,
    clientY: clientPoint.y,
    screenX: clientPoint.x,
    screenY: clientPoint.y,
    deltaX,
    deltaY,
    deltaMode,
    view: context.mapWindow,
  }), target);
}

function dispatchForwardedMapEvent(event, target) {
  markForwardedMapGestureEvent(event);
  target.dispatchEvent(event);
}

function markForwardedMapGestureEvent(event) {
  Object.defineProperty(event, FORWARDED_MAP_GESTURE_EVENT_FLAG, {
    configurable: true,
    enumerable: false,
    value: true,
  });
}
