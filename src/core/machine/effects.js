export const MACHINE_EFFECT_KIND = Object.freeze({
  READ_PASTE_IMAGE: "read-paste-image",
  START_MANUAL_PASTE_CAPTURE: "start-manual-paste-capture",
  CANCEL_MANUAL_PASTE_CAPTURE: "cancel-manual-paste-capture",
  START_PANEL_TIMEOUT: "start-panel-timeout",
  CANCEL_PANEL_TIMEOUT: "cancel-panel-timeout",
  START_STATUS_TIMEOUT: "start-status-timeout",
  CANCEL_STATUS_TIMEOUT: "cancel-status-timeout",
});

export const MACHINE_EFFECT_RESULT_KIND = Object.freeze({
  READ_PASTE_IMAGE: "read-paste-image-result",
  PANEL_TIMEOUT_ELAPSED: "panel-timeout-elapsed-result",
  STATUS_TIMEOUT_ELAPSED: "status-timeout-elapsed-result",
});

export function createReadPasteImageEffect({ requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId,
  };
}

export function createReadPasteImageResult({
  requestId,
  source,
  outcome = null,
} = {}) {
  return {
    kind: MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE,
    requestId,
    source,
    outcome,
  };
}

export function createPanelTimeoutElapsedResult({ requestId } = {}) {
  return {
    kind: MACHINE_EFFECT_RESULT_KIND.PANEL_TIMEOUT_ELAPSED,
    requestId,
  };
}

export function createStatusTimeoutElapsedResult({ requestId } = {}) {
  return {
    kind: MACHINE_EFFECT_RESULT_KIND.STATUS_TIMEOUT_ELAPSED,
    requestId,
  };
}

export function createStartManualPasteCaptureEffect({ requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE,
    requestId,
  };
}

export function createCancelManualPasteCaptureEffect({ requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE,
    requestId,
  };
}

export function createStartPanelTimeoutEffect({ intent, requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
    intent,
    requestId,
  };
}

export function createCancelPanelTimeoutEffect({ requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    requestId,
  };
}

export function createStartStatusTimeoutEffect({ requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT,
    requestId,
  };
}

export function createCancelStatusTimeoutEffect({ requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT,
    requestId,
  };
}
