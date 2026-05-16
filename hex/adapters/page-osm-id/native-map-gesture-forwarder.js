import {
  createGestureForwardingAdapter,
} from "./gesture-forwarding-adapter.js";
import {
  findViewportElement,
} from "./page-dom-reader.js";
import {
  labelDebugNode,
} from "./debug-label.js";
import {
  isExtensionOwnedNode,
} from "./native-map-owned-target.js";

export function createNativeMapGestureForwarder({
  document,
  ownerWindow,
  eventDebugLogger,
  readPageContext,
}) {
  return createGestureForwardingAdapter({
    readActiveMapGestureContext({ screenPx } = {}) {
      const context = readNativeMapGestureContext({
        document,
        ownerWindow,
        readPageContext,
        screenPx,
      });
      eventDebugLogger?.log("native-map.context", "read", {
        screenPx,
        frameScreenPx: context?.frameScreenPx,
        panTarget: labelDebugNode(context?.panTarget),
        continuationTarget: labelDebugNode(context?.continuationTarget),
        hitTestStack: context?.hitTestStack?.slice(0, 8).map(labelDebugNode),
        extensionOwnedTargets: Array.from(context?.extensionOwnedTargets ?? []).map(labelDebugNode),
        mapHref: context?.mapWindow?.location?.href,
      });
      return context;
    },
    dispatchForwardedPointer(event) {
      dispatchForwardedPointerEvent({
        ...event,
        eventDebugLogger,
      });
    },
    dispatchForwardedWheel(event) {
      dispatchForwardedWheelEvent({
        ...event,
        eventDebugLogger,
      });
    },
  });
}

function readNativeMapGestureContext({
  document,
  ownerWindow,
  readPageContext,
  screenPx,
}) {
  const pageContext = readPageContext();
  const surface = pageContext?.surface;
  const mapDocument = surface?.kind === "embedded-editor-frame"
    ? surface.viewportDocument
    : document;
  const mapWindow = mapDocument?.defaultView ?? ownerWindow;
  const frameRect = surface?.kind === "embedded-editor-frame"
    ? surface.frameElement.getBoundingClientRect()
    : {
        left: 0,
        top: 0,
      };
  const frameScreenPx = {
    x: frameRect.left,
    y: frameRect.top,
  };
  const clientPx = screenPx ? {
    x: screenPx.x - frameScreenPx.x,
    y: screenPx.y - frameScreenPx.y,
  } : null;
  const hitTestStack = clientPx && typeof mapDocument.elementsFromPoint === "function"
    ? Array.from(mapDocument.elementsFromPoint(clientPx.x, clientPx.y))
    : [];
  const mapTarget = findViewportElement(mapDocument)
    ?? mapDocument.querySelector("#map")
    ?? mapDocument.body
    ?? mapDocument.documentElement;
  const extensionOwnedTargets = new Set(
    hitTestStack.filter((target) => isExtensionOwnedNode(target)),
  );
  return {
    frameScreenPx,
    panTarget: mapTarget,
    continuationTarget: mapDocument,
    hitTestStack,
    extensionOwnedTargets,
    mapWindow,
  };
}

function dispatchForwardedPointerEvent({
  phase,
  target,
  clientPx,
  eventDebugLogger,
}) {
  const eventType = {
    start: "pointerdown",
    move: "pointermove",
    end: "pointerup",
  }[phase];
  if (!eventType || !target) {
    return;
  }
  const event = createPointerLikeEvent(ownerWindowForEventTarget(target), eventType, {
    clientX: clientPx.x,
    clientY: clientPx.y,
    button: 0,
    buttons: phase === "end" ? 0 : 1,
  });
  markForwardedNativeMapEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-pointer", {
    phase,
    eventType,
    target: labelDebugNode(target),
    clientPx,
    mapHref: ownerWindowForEventTarget(target)?.location?.href,
  });
  target.dispatchEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-pointer-result", {
    phase,
    eventType,
    defaultPrevented: event.defaultPrevented,
    target: labelDebugNode(target),
    mapHref: ownerWindowForEventTarget(target)?.location?.href,
  });
}

function dispatchForwardedWheelEvent({
  target,
  clientPx,
  deltaY,
  eventDebugLogger,
}) {
  if (!target) {
    return;
  }
  const ownerWindow = ownerWindowForEventTarget(target);
  const event = new ownerWindow.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: clientPx.x,
    clientY: clientPx.y,
    deltaY,
    deltaMode: 0,
  });
  markForwardedNativeMapEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-wheel", {
    target: labelDebugNode(target),
    clientPx,
    deltaY,
    mapHref: ownerWindow?.location?.href,
  });
  target.dispatchEvent(event);
  eventDebugLogger?.log("native-map.dispatch", "forwarded-wheel-result", {
    defaultPrevented: event.defaultPrevented,
    target: labelDebugNode(target),
    mapHref: ownerWindow?.location?.href,
  });
}

function markForwardedNativeMapEvent(event) {
  Object.defineProperty(event, "__idOverlayForwardedNativeMap", {
    configurable: true,
    value: true,
  });
}

function createPointerLikeEvent(ownerWindow, type, options) {
  const EventConstructor = ownerWindow?.PointerEvent ?? ownerWindow?.MouseEvent;
  return new EventConstructor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    ...options,
  });
}

function ownerWindowForEventTarget(target) {
  return target?.ownerDocument?.defaultView ?? target?.defaultView ?? null;
}
