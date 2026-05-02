export const MACHINE_EFFECT_KIND = Object.freeze({
  READ_PASTE_IMAGE: "read-paste-image",
  START_PANEL_TIMEOUT: "start-panel-timeout",
  CANCEL_PANEL_TIMEOUT: "cancel-panel-timeout",
});

export function createReadPasteImageEffect({ requestId }) {
  return {
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
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
