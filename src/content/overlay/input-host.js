export function createOverlayInputHost({
  getMountElement,
  mountedHandlers,
  globalPointerHandlers,
  fallbackWindow = globalThis.window,
}) {
  const mountedInputListeners = [
    ["pointermove", mountedHandlers.handleMountedPointerMove, true],
    ["pointerleave", mountedHandlers.handleMountedPointerLeave, true],
    ["pointerdown", mountedHandlers.handleMountedPointerDown, true],
    ["click", mountedHandlers.handleMountedClick, true],
    ["dblclick", mountedHandlers.handleMountedDoubleClick, true],
    ["wheel", mountedHandlers.handleMountedWheel, { capture: true, passive: false }],
  ];
  const globalPointerListeners = [
    ["pointermove", globalPointerHandlers.handleGlobalPointerMove, true],
    ["pointerup", globalPointerHandlers.handleGlobalPointerUp, true],
    ["pointercancel", globalPointerHandlers.handleGlobalPointerCancel, true],
  ];
  let mountedInputTarget = null;
  let globalPointerTarget = null;
  let isDestroyed = false;

  return {
    syncMountedInputListeners,
    syncGlobalPointerListeners,
    destroy,
  };

  function syncMountedInputListeners() {
    if (isDestroyed) {
      return;
    }
    const nextMountedInputTarget = getMountElement() ?? null;
    if (mountedInputTarget === nextMountedInputTarget) {
      return;
    }
    detachMountedInputListeners();
    if (!nextMountedInputTarget) {
      return;
    }
    for (const [type, handler, options] of mountedInputListeners) {
      nextMountedInputTarget.addEventListener(type, handler, options);
    }
    mountedInputTarget = nextMountedInputTarget;
  }

  function syncGlobalPointerListeners(shouldListenGlobally) {
    if (isDestroyed) {
      return;
    }
    if (!shouldListenGlobally) {
      detachGlobalPointerListeners();
      return;
    }
    const nextGlobalPointerTarget = resolveGlobalPointerTarget();
    if (!nextGlobalPointerTarget) {
      detachGlobalPointerListeners();
      return;
    }
    if (globalPointerTarget === nextGlobalPointerTarget) {
      return;
    }
    detachGlobalPointerListeners();
    for (const [type, handler, options] of globalPointerListeners) {
      nextGlobalPointerTarget.addEventListener(type, handler, options);
    }
    globalPointerTarget = nextGlobalPointerTarget;
  }

  function destroy() {
    isDestroyed = true;
    detachGlobalPointerListeners();
    detachMountedInputListeners();
  }

  function detachMountedInputListeners() {
    if (!mountedInputTarget) {
      return;
    }
    for (const [type, handler, options] of mountedInputListeners) {
      mountedInputTarget.removeEventListener(type, handler, options);
    }
    mountedInputTarget = null;
  }

  function detachGlobalPointerListeners() {
    if (!globalPointerTarget) {
      return;
    }
    for (const [type, handler, options] of globalPointerListeners) {
      globalPointerTarget.removeEventListener(type, handler, options);
    }
    globalPointerTarget = null;
  }

  function resolveGlobalPointerTarget() {
    const mountElement = getMountElement();
    return mountElement?.ownerDocument?.defaultView ?? fallbackWindow ?? null;
  }
}
