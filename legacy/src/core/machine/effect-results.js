import { normalizeMachinePasteSource } from "./paste-read.js";

export const MACHINE_EFFECT_RESULT_KIND = Object.freeze({
  READ_PASTE_IMAGE: "read-paste-image-result",
  PANEL_TIMEOUT_ELAPSED: "panel-timeout-elapsed-result",
  STATUS_TIMEOUT_ELAPSED: "status-timeout-elapsed-result",
});

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
