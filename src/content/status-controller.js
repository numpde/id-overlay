import { createValueStore } from "../core/value-store.js";
import { resolveRegistrationSolveState } from "../core/state.js";
import { resolveOverlayRenderSource } from "../core/transform.js";

const DEFAULT_TRANSIENT_MS = 1800;

export function createStatusController({ store, interactions }) {
  const messageStore = createValueStore("");
  let transientMessage = null;
  let transientTimer = null;

  const unsubscribeStore = store.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeInteractions = interactions.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeInteractionEvents = interactions.subscribeEvents?.((event) => {
    if (event?.type === "pin-result") {
      showPinResult(event.result);
      return;
    }
    if (event?.type === "solve-result") {
      showSolveResult(event.result);
      return;
    }
    if (event?.type === "pins-cleared") {
      showTransient("Cleared all registration pins.");
    }
  }) ?? null;

  syncMessage();

  function subscribe(listener, options) {
    return messageStore.subscribe(listener, options);
  }

  function getMessage() {
    return messageStore.get();
  }

  function showTransient(message, { durationMs = DEFAULT_TRANSIENT_MS } = {}) {
    transientMessage = message;
    syncMessage();
    clearTransientTimer();
    transientTimer = globalThis.setTimeout(() => {
      transientMessage = null;
      syncMessage();
    }, durationMs);
  }

  function showPinResult(result, options) {
    showTransient(describePinResult(result), options);
  }

  function showSolveResult(result, options) {
    showTransient(describeSolveResult(result), options);
  }

  function destroy() {
    clearTransientTimer();
    unsubscribeStore();
    unsubscribeInteractions();
    unsubscribeInteractionEvents?.();
  }

  function syncMessage() {
    messageStore.set(
      transientMessage ??
        deriveDefaultStatusMessage({
          state: store.getState(),
          runtime: interactions.getRuntimeState(),
        }),
    );
  }

  function clearTransientTimer() {
    if (transientTimer) {
      globalThis.clearTimeout(transientTimer);
      transientTimer = null;
    }
  }

  return {
    subscribe,
    getMessage,
    showTransient,
    showPinResult,
    showSolveResult,
    destroy,
  };
}

export function deriveDefaultStatusMessage({ state, runtime }) {
  if (!state.image) {
    return "Paste a screenshot to begin.";
  }

  if (resolveOverlayRenderSource(state) === "solved") {
    if (state.mode === "trace") {
      return "Trace mode: the overlay follows the map using the solved transform.";
    }
    return "Align mode: solved transform preview active. Switch to Trace to verify map-following, or adjust placement to refine and recompute.";
  }

  if (state.mode === "trace") {
    return "Trace mode: the overlay follows the map using the current manual placement.";
  }

  if (runtime.isPassThroughActive) {
    return "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.";
  }

  if (runtime.isDragging && runtime.dragMode === "shared-pan") {
    return "Shared pan: moving the map and overlay together.";
  }

  if (runtime.isDragging) {
    return "Dragging overlay. Release to keep this placement.";
  }

  const solveState = resolveRegistrationSolveState(state.registration);
  if (solveState.kind === "dirty") {
    return "Align mode: pins changed. Compute the transform or switch to Trace to auto-apply it.";
  }

  return "Align mode: drag to move, wheel to scale, Shift+wheel to rotate, Shift+drag to move map and overlay together, double-click or press P to add/remove pins, then compute the transform.";
}

export function getModeButtonActionLabel(mode) {
  return mode === "align" ? "Trace" : "Align";
}

export function describePinResult(result) {
  if (result?.ok && result.action === "added") {
    return `Added pin ${result.pin.id}.`;
  }
  if (result?.ok && result.action === "removed") {
    return `Removed pin ${result.pin.id}.`;
  }

  switch (result?.reason) {
    case "pointer-outside-image":
    case "no-pointer":
      return "Move the pointer over the screenshot before adding a pin.";
    case "not-align-mode":
      return "Switch to Align before editing pins.";
    case "no-image":
      return "Paste a screenshot before pinning.";
    default:
      return "Pinning is not available right now.";
  }
}

export function describeSolveResult(result) {
  if (result?.ok) {
    return `Computed transform from ${result.pinCount} pin(s).`;
  }
  if (result?.reason === "insufficient-pins") {
    return `Need at least 2 pins to compute a transform. Current pins: ${result.pinCount ?? 0}.`;
  }
  return "Could not compute a transform from the current pins.";
}
