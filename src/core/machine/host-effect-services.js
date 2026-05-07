import { createMachineEffectRunner } from "./effect-runner.js";
import {
  createPanelTimeoutElapsedResult,
  createStatusTimeoutElapsedResult,
} from "./effect-results.js";
import { createRequestTimerRegistry } from "./request-timers.js";

const DEFAULT_PANEL_TIMEOUT_MS = 1800;
const DEFAULT_STATUS_TIMEOUT_MS = 1800;

export function createMachineHostEffectServices({
  readPasteImage = null,
  startManualPasteCapture = null,
  cancelManualPasteCapture = null,
  setPanelTimeout = null,
  clearPanelTimeout = null,
  panelTimeoutMs = DEFAULT_PANEL_TIMEOUT_MS,
  setStatusTimeout = null,
  clearStatusTimeout = null,
  statusTimeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
  completeEffectResult = null,
  reportError = null,
} = {}) {
  const panelTimers = createRequestTimerRegistry({
    setTimer: setPanelTimeout,
    clearTimer: clearPanelTimeout,
    delayMs: panelTimeoutMs,
    createElapsedResult: createPanelTimeoutElapsedResult,
    completeElapsed: completeEffectResult,
  });
  const statusTimers = createRequestTimerRegistry({
    setTimer: setStatusTimeout,
    clearTimer: clearStatusTimeout,
    delayMs: statusTimeoutMs,
    createElapsedResult: createStatusTimeoutElapsedResult,
    completeElapsed: completeEffectResult,
  });
  const runEffect = createMachineEffectRunner({
    readPasteImage,
    startManualPasteCapture,
    cancelManualPasteCapture,
    startPanelTimeout,
    cancelPanelTimeout,
    startStatusTimeout,
    cancelStatusTimeout,
    completeEffect: completeEffectResult,
    onError: reportError,
  });

  function startPanelTimeout({ intent, requestId, context }) {
    panelTimers.start({
      intent,
      requestId,
      context,
    });
  }

  function cancelPanelTimeout({ requestId }) {
    panelTimers.cancel({ requestId });
  }

  function startStatusTimeout({ requestId, context }) {
    statusTimers.start({
      requestId,
      context,
    });
  }

  function cancelStatusTimeout({ requestId }) {
    statusTimers.cancel({ requestId });
  }

  function destroy() {
    cancelManualPasteCapture?.({ requestId: null });
    panelTimers.clearAll();
    statusTimers.clearAll();
  }

  return {
    runEffect,
    destroy,
  };
}
