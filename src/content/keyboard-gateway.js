export function createKeyboardGateway(windowTarget = globalThis.window) {
  const subscribers = new Set();
  let destroyed = false;

  function notify(type, event) {
    for (const subscriber of subscribers) {
      subscriber[type]?.(event);
    }
  }

  function handleKeyDown(event) {
    notify("keydown", event);
  }

  function handleKeyUp(event) {
    notify("keyup", event);
  }

  function handleBlur(event) {
    notify("blur", event);
  }

  windowTarget.addEventListener("keydown", handleKeyDown, true);
  windowTarget.addEventListener("keyup", handleKeyUp, true);
  windowTarget.addEventListener("blur", handleBlur);

  function subscribe(subscriber) {
    if (destroyed) {
      return () => {};
    }
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    subscribers.clear();
    windowTarget.removeEventListener("keydown", handleKeyDown, true);
    windowTarget.removeEventListener("keyup", handleKeyUp, true);
    windowTarget.removeEventListener("blur", handleBlur);
  }

  return Object.freeze({
    subscribe,
    destroy,
  });
}
