import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../clipboard-facts.js";
import {
  MACHINE_PASTE_READ_OUTCOME_KIND,
  MACHINE_PASTE_SOURCE,
  createClipboardFailurePasteReadOutcome,
  createDecodedImagePasteReadOutcome,
  normalizeMachinePasteSource,
} from "./paste-read.js";
import { MACHINE_EFFECT_RESULT_KIND } from "./effect-results.js";
import {
  MACHINE_STATUS_NOTICE_KIND,
  createStatusNotice,
} from "./status-notices.js";
import {
  cancelPanelIntent,
  createStatusNoticeResult,
  isCurrentPasteRequest,
} from "./panel-status-transition.js";
import { loadImageSession } from "./session-transition.js";
import {
  createTransitionResult,
} from "./transition-result.js";

export const PASTE_EFFECT_RESULT_TRANSITIONS = Object.freeze({
  [MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE]: completePasteRead,
});

export function completePasteRead(state, result) {
  const source = normalizeMachinePasteSource(result.source);
  if (!isCurrentPasteRequest(state, result) || !source) {
    return createTransitionResult({ state });
  }
  const outcome = normalizePasteReadOutcome(result.outcome);
  if (!outcome) {
    return createTransitionResult({ state });
  }
  if (outcome.kind === MACHINE_PASTE_READ_OUTCOME_KIND.DECODED_IMAGE) {
    return loadImageSession(state, {
      image: outcome.image,
      placement: outcome.placement,
      requestId: result.requestId,
    });
  }
  if (outcome.kind !== MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE) {
    return createTransitionResult({ state });
  }
  const noticeKind = resolveClipboardFailureNoticeKind(outcome.failureKind);
  if (!noticeKind) {
    return createTransitionResult({ state });
  }
  const statusEvent = {
    noticeKind,
    noticePayload: null,
  };
  if (source !== MACHINE_PASTE_SOURCE.MANUAL_PASTE) {
    return createStatusNoticeResult(state, statusEvent);
  }
  const cancelled = cancelPanelIntent(state, {
    requestId: result.requestId,
  });
  return createTransitionResult({
    state: cancelled.state,
    effects: cancelled.effects,
    statusNotice: createStatusNotice(statusEvent.noticeKind, statusEvent.noticePayload),
  });
}

export function normalizePasteReadOutcome(outcome) {
  if (!outcome || typeof outcome !== "object") {
    return null;
  }
  if (outcome.kind === MACHINE_PASTE_READ_OUTCOME_KIND.DECODED_IMAGE) {
    return createDecodedImagePasteReadOutcome({
      image: outcome.image,
      placement: outcome.placement ?? null,
    });
  }
  if (outcome.kind === MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE) {
    return createClipboardFailurePasteOutcome({
      failureKind: outcome.failureKind,
    });
  }
  return null;
}

function createClipboardFailurePasteOutcome({ failureKind }) {
  if (!resolveClipboardFailureNoticeKind(failureKind)) {
    return null;
  }
  return createClipboardFailurePasteReadOutcome({ failureKind });
}

function resolveClipboardFailureNoticeKind(failureKind) {
  switch (failureKind) {
    case CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE:
      return MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE;
    case CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE:
      return MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_IMAGE_UNREADABLE;
    default:
      return null;
  }
}
