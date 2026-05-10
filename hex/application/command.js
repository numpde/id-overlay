import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "./errors.js";
import { isPlainData } from "./plain-data.js";
import { isReferenceImageData } from "./reference-image.js";

export const APPLICATION_COMMAND_KIND = Object.freeze({
  HYDRATE: "hydrate",
  SELECT_MODE: "select-mode",
  TOGGLE_REGISTRATION_PIN: "toggle-registration-pin",
  CLEAR_REGISTRATION_PINS: "clear-registration-pins",
  COMMIT_PLACEMENT_EDIT: "commit-placement-edit",
  ACTIVATE_PRIMARY_ACTION: "activate-primary-action",
  REPORT_REFERENCE_IMAGE_PASTE_OUTCOME: "report-reference-image-paste-outcome",
  CLEAR_REFERENCE_IMAGE: "clear-reference-image",
  CLEAR_STATUS_NOTICE: "clear-status-notice",
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
  if (
    kind === APPLICATION_COMMAND_KIND.SELECT_MODE
      && !["align", "trace"].includes(payload.mode)
  ) {
    throw new ApplicationBoundaryError({
      code: APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
      message: "Invalid mode command.",
    });
  }
  if (kind === APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME) {
    assertValidReferenceImagePasteOutcomePayload(payload);
  }

  if (
    kind === APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT
      && Object.hasOwn(payload, "kind")
  ) {
    return {
      ...payload,
      editKind: payload.kind,
      kind,
    };
  }

  return {
    ...payload,
    kind,
  };
}

function assertValidReferenceImagePasteOutcomePayload(payload) {
  if (!isPositiveInteger(payload.requestId)) {
    throwInvalidApplicationCommand();
  }

  const outcome = payload.outcome;
  if (outcome?.kind === "accepted") {
    assertValidReferenceImage(outcome.referenceImage);
    return;
  }
  if (outcome?.kind === "empty") {
    return;
  }
  if (
    outcome?.kind === "failed"
      && typeof outcome.reason === "string"
      && outcome.reason.length > 0
  ) {
    return;
  }
  throwInvalidApplicationCommand();
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
