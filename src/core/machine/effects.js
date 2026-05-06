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

export const MACHINE_PASTE_SOURCE = Object.freeze({
  CLIPBOARD_API: "clipboard-api",
  MANUAL_PASTE: "manual-paste",
});

export const MACHINE_PASTE_READ_OUTCOME_KIND = Object.freeze({
  CLIPBOARD_FACT: "clipboard-fact",
});

const KNOWN_PASTE_SOURCES = new Set(Object.values(MACHINE_PASTE_SOURCE));

export function normalizeMachinePasteSource(source) {
  return KNOWN_PASTE_SOURCES.has(source) ? source : null;
}

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
    source: normalizeMachinePasteSource(source),
    outcome,
  };
}

export function createClipboardFactPasteReadOutcome({ fact, snapshot }) {
  if (!fact) {
    return null;
  }
  return {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FACT,
    fact,
    snapshot: snapshot ?? null,
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
