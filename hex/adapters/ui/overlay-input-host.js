export function createOverlayInputHost({
  getMountElement,
  globalPointerHandlers,
  fallbackWindow,
}) {
  let activeWindow = null;
  let listening = false;

  return {
    syncGlobalPointerListeners(shouldListen) {
      const nextWindow = shouldListen ? resolveWindow(getMountElement(), fallbackWindow) : null;
      if (activeWindow && (!shouldListen || activeWindow !== nextWindow)) {
        removeListeners(activeWindow, globalPointerHandlers);
        listening = false;
      }
      activeWindow = nextWindow;
      if (shouldListen && activeWindow && !listening) {
        addListeners(activeWindow, globalPointerHandlers);
        listening = true;
      }
    },
    destroy() {
      if (activeWindow && listening) {
        removeListeners(activeWindow, globalPointerHandlers);
      }
      activeWindow = null;
      listening = false;
    },
  };
}

function resolveWindow(mountElement, fallbackWindow) {
  return mountElement?.ownerDocument?.defaultView ?? fallbackWindow;
}

function addListeners(window, handlers) {
  window.addEventListener("pointermove", handlers.handleGlobalPointerMove);
  window.addEventListener("pointerup", handlers.handleGlobalPointerUp);
  window.addEventListener("pointercancel", handlers.handleGlobalPointerUp);
}

function removeListeners(window, handlers) {
  window.removeEventListener("pointermove", handlers.handleGlobalPointerMove);
  window.removeEventListener("pointerup", handlers.handleGlobalPointerUp);
  window.removeEventListener("pointercancel", handlers.handleGlobalPointerUp);
}
