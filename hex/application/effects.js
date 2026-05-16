import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "./command.js";

export function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

export function requestReferenceImageInputEffect({ requestId, intent }) {
  return {
    kind: "request-reference-image-input",
    requestId,
    intent,
  };
}

export function cancelReferenceImageInputEffect(requestId) {
  return {
    kind: "cancel-reference-image-input",
    requestId,
  };
}

export function loadReferenceImageInputIntent() {
  return {
    kind: "load-reference-image",
  };
}

export function replaceReferenceImageInputIntent() {
  return {
    kind: "replace-reference-image",
  };
}

export function scheduleClearStatusNoticeEffect(requestId) {
  return scheduleApplicationCommandEffect({
    scheduleId: "status-notice",
    delayMs: 2500,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE,
      { requestId },
    ),
  });
}

export function scheduleClearPanelIntentEffect({ requestId, intentKind }) {
  return scheduleApplicationCommandEffect({
    scheduleId: "panel-intent",
    delayMs: 2500,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT,
      {
        requestId,
        intentKind,
      },
    ),
  });
}

function scheduleApplicationCommandEffect({ scheduleId, delayMs, command }) {
  return {
    kind: "schedule-application-command",
    scheduleId,
    delayMs,
    command,
  };
}
