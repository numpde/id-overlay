export function createOverlayInputHost({
  getMountElement,
  mountedHandlers,
  globalPointerHandlers,
  fallbackWindow = globalThis.window,
}) {
  const mountedInputListeners = createRetargetableListenerSet([
    ["pointermove", mountedHandlers.handleMountedPointerMove, true],
    ["pointerleave", mountedHandlers.handleMountedPointerLeave, true],
    ["pointerdown", mountedHandlers.handleMountedPointerDown, true],
    ["click", mountedHandlers.handleMountedClick, true],
    ["dblclick", mountedHandlers.handleMountedDoubleClick, true],
    ["wheel", mountedHandlers.handleMountedWheel, { capture: true, passive: false }],
  ]);
  const globalPointerListeners = createRetargetableListenerSet([
    ["pointermove", globalPointerHandlers.handleGlobalPointerMove, true],
    ["pointerup", globalPointerHandlers.handleGlobalPointerUp, true],
    ["pointercancel", globalPointerHandlers.handleGlobalPointerCancel, true],
  ]);
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
    mountedInputListeners.retarget(nextMountedInputTarget);
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
    globalPointerListeners.retarget(nextGlobalPointerTarget);
  }

  function destroy() {
    isDestroyed = true;
    detachGlobalPointerListeners();
    detachMountedInputListeners();
  }

  function detachMountedInputListeners() {
    mountedInputListeners.detach();
  }

  function detachGlobalPointerListeners() {
    globalPointerListeners.detach();
  }

  function resolveGlobalPointerTarget() {
    const mountElement = getMountElement();
    return mountElement?.ownerDocument?.defaultView ?? fallbackWindow ?? null;
  }
}

function createRetargetableListenerSet(listeners) {
  let target = null;
  return {
    retarget(nextTarget) {
      if (target === nextTarget) {
        return;
      }
      this.detach();
      if (!nextTarget) {
        return;
      }
      for (const [type, handler, options] of listeners) {
        nextTarget.addEventListener(type, handler, options);
      }
      target = nextTarget;
    },
    detach() {
      if (!target) {
        return;
      }
      for (const [type, handler, options] of listeners) {
        target.removeEventListener(type, handler, options);
      }
      target = null;
    },
  };
}
