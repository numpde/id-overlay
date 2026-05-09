export function installPointerEvents(ownerWindow) {
  Object.defineProperty(ownerWindow, "PointerEvent", {
    configurable: true,
    value: ownerWindow.MouseEvent,
  });
}

export function removePointerEvents(ownerWindow) {
  Object.defineProperty(ownerWindow, "PointerEvent", {
    configurable: true,
    value: undefined,
  });
}

export function createPointerEvent(ownerWindow, type, options = {}) {
  return new ownerWindow.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...options,
  });
}
