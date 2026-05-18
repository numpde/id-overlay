import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "./errors.js";
import { normalizeOpacity } from "../domain/opacity.js";
import { isPlacementData } from "./placement.js";
import { isPlainData } from "./plain-data.js";
import { isReferenceImageData } from "./reference-image.js";

export const APPLICATION_COMMAND_KIND = Object.freeze({
  HYDRATE: "hydrate",
  SELECT_MODE: "select-mode",
  TOGGLE_REGISTRATION_PIN: "toggle-registration-pin",
  CLEAR_REGISTRATION_PINS: "clear-registration-pins",
  COMMIT_PLACEMENT_EDIT: "commit-placement-edit",
  CENTER_OVERLAY_IN_VIEW: "center-overlay-in-view",
  ACTIVATE_PRIMARY_ACTION: "activate-primary-action",
  REQUEST_REFERENCE_IMAGE_REPLACEMENT: "request-reference-image-replacement",
  REPORT_REFERENCE_IMAGE_INPUT_OUTCOME: "report-reference-image-input-outcome",
  CLEAR_REFERENCE_IMAGE: "clear-reference-image",
  CLEAR_STATUS_NOTICE: "clear-status-notice",
  CLEAR_PANEL_INTENT: "clear-panel-intent",
  UNDO: "undo",
  REDO: "redo",
  SET_OPACITY: "set-opacity",
  SET_TEMPORARY_INPUT_POSTURE: "set-temporary-input-posture",
});

const KNOWN_COMMAND_KINDS = new Set(Object.values(APPLICATION_COMMAND_KIND));

export function createApplicationCommand(kind, payload = {}) {
  if (!KNOWN_COMMAND_KINDS.has(kind)) {
    throw new ApplicationBoundaryError({
      code: APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
      message: "Unknown application command.",
    });
  }
  if (!isPlainData(payload)) {
    throw new ApplicationBoundaryError({
      code: kind === APPLICATION_COMMAND_KIND.HYDRATE
        ? APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE
        : APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
      message: "Invalid application command payload.",
    });
  }
  if (kind === APPLICATION_COMMAND_KIND.SELECT_MODE) {
    return createSelectModeCommand(payload);
  }
  if (kind === APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME) {
    assertValidReferenceImageInputOutcomePayload(payload);
  }

  if (kind === APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT) {
    return createPlacementEditCommand(payload);
  }

  if (kind === APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW) {
    return createCenterReferenceInViewCommand(payload);
  }

  if (kind === APPLICATION_COMMAND_KIND.SET_OPACITY) {
    return createSetOpacityCommand(payload);
  }

  if (kind === APPLICATION_COMMAND_KIND.SET_TEMPORARY_INPUT_POSTURE) {
    return createSetTemporaryInputPostureCommand(payload);
  }

  return {
    ...payload,
    kind,
  };
}

function createSelectModeCommand(payload) {
  if (
    Object.keys(payload).length !== 1
      || !["align", "trace"].includes(payload.mode)
  ) {
    throwInvalidApplicationCommand();
  }

  return {
    kind: APPLICATION_COMMAND_KIND.SELECT_MODE,
    mode: payload.mode,
  };
}

function createCenterReferenceInViewCommand(payload) {
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return {
      kind: APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW,
    };
  }
  if (
    keys.length !== 1
      || !isPlacementData(payload.placement)
  ) {
    throwInvalidApplicationCommand();
  }
  return {
    kind: APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW,
    placement: payload.placement,
  };
}

function createSetOpacityCommand(payload) {
  if (!Number.isFinite(payload.opacity)) {
    throwInvalidApplicationCommand();
  }

  return {
    kind: APPLICATION_COMMAND_KIND.SET_OPACITY,
    opacity: normalizeOpacity(payload.opacity),
  };
}

function createSetTemporaryInputPostureCommand(payload) {
  if (
    Object.keys(payload).length !== 1
      || !["native-map", "normal"].includes(payload.posture)
  ) {
    throwInvalidApplicationCommand();
  }

  return {
    kind: APPLICATION_COMMAND_KIND.SET_TEMPORARY_INPUT_POSTURE,
    posture: payload.posture,
  };
}

function createPlacementEditCommand(payload) {
  const editKind = payload.editKind ?? payload.kind;
  if (
    !["move", "rotate", "scale"].includes(editKind)
      || !isPlacementData(payload.placement)
  ) {
    throwInvalidApplicationCommand();
  }

  const { kind: _payloadKind, editKind: _payloadEditKind, ...rest } = payload;
  return {
    ...rest,
    editKind,
    kind: APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
  };
}

function assertValidReferenceImageInputOutcomePayload(payload) {
  if (!isPositiveInteger(payload.requestId)) {
    throwInvalidApplicationCommand();
  }

  const outcome = payload.outcome;
  if (outcome?.kind === "accepted") {
    assertValidReferenceImage(outcome.referenceImage);
    if (
      Object.hasOwn(outcome, "placement")
        && !isPlacementData(outcome.placement)
    ) {
      throwInvalidApplicationCommand();
    }
    return;
  }
  if (outcome?.kind === "empty") {
    return;
  }
  if (
    outcome?.kind === "failed"
      && isReferenceImageInputFailureReason(outcome.reason)
  ) {
    return;
  }
  throwInvalidApplicationCommand();
}

function isReferenceImageInputFailureReason(reason) {
  return [
    "source-unavailable",
    "decode-failed",
    "unsupported-image",
  ].includes(reason);
}

function assertValidReferenceImage(referenceImage) {
  if (!isReferenceImageData(referenceImage)) {
    throwInvalidApplicationCommand();
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function throwInvalidApplicationCommand() {
  throw new ApplicationBoundaryError({
    code: APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
    message: "Invalid application command payload.",
  });
}
