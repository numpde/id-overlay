import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../clipboard-facts.js";
import {
  MACHINE_PASTE_READ_OUTCOME_KIND,
  MACHINE_PASTE_SOURCE,
  normalizeMachinePasteSource,
} from "./effects.js";
import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";
import {
  cancelPanelIntent,
  createStatusNoticeResult,
  isCurrentPasteRequest,
} from "./panel-status-transition.js";
import { loadImageSession } from "./session-transition.js";
import {
  createStatusNotice,
  createTransitionResult,
} from "./transition-result.js";
import { createPlacementTransform } from "../transform.js";

export const MACHINE_PASTE_READ_INTERPRETATION_KIND = Object.freeze({
  DECODED_IMAGE: "decoded-image",
  CLIPBOARD_FAILURE: "clipboard-failure",
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
  if (outcome.kind === MACHINE_PASTE_READ_INTERPRETATION_KIND.DECODED_IMAGE) {
    return loadImageSession(state, {
      image: outcome.image,
      placement: outcome.placement,
      requestId: result.requestId,
    });
  }
  if (outcome.kind !== MACHINE_PASTE_READ_INTERPRETATION_KIND.CLIPBOARD_FAILURE) {
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
  if (outcome.kind === MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FACT) {
    return createPasteReadOutcomeFromClipboardFact({
      fact: outcome.fact,
      snapshot: outcome.snapshot,
    });
  }
  if (outcome.kind === MACHINE_PASTE_READ_INTERPRETATION_KIND.DECODED_IMAGE) {
    return createDecodedImagePasteOutcome({
      image: outcome.image,
      placement: outcome.placement ?? null,
    });
  }
  if (outcome.kind === MACHINE_PASTE_READ_INTERPRETATION_KIND.CLIPBOARD_FAILURE) {
    return createClipboardFailurePasteOutcome({
      failureKind: outcome.failureKind,
    });
  }
  return null;
}

export function createPasteReadOutcomeFromClipboardFact({ fact, snapshot }) {
  if (!fact || fact.kind === CLIPBOARD_IMAGE_READ_KIND.UNAVAILABLE) {
    return null;
  }
  if (fact.kind === CLIPBOARD_IMAGE_READ_KIND.DECODED_IMAGE) {
    return createDecodedImagePasteOutcome({
      image: fact.image,
      snapshot,
    });
  }
  if (fact.kind === CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE) {
    return createClipboardFailurePasteOutcome({
      failureKind: fact.kind,
    });
  }
  if (fact.kind === CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE) {
    return createClipboardFailurePasteOutcome({
      failureKind: fact.kind,
    });
  }
  return null;
}

export function createDecodedImagePasteOutcome({ image, placement = null, snapshot = null }) {
  // TODO(smell): Paste outcome interpretation can derive initial placement from
  // a live page snapshot, so paste facts still know about map placement policy.
  // The final machine boundary should receive either a decoded image fact plus a
  // separate page-context fact, or an already-authored load-image intent.
  if (!image) {
    return null;
  }
  return {
    kind: MACHINE_PASTE_READ_INTERPRETATION_KIND.DECODED_IMAGE,
    image,
    placement: placement ?? (snapshot ? createPlacementTransform({
      image,
      centerMapLatLon: snapshot.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: snapshot.mapView.zoom,
    }) : null),
  };
}

export function createClipboardFailurePasteOutcome({ failureKind }) {
  if (!resolveClipboardFailureNoticeKind(failureKind)) {
    return null;
  }
  return {
    kind: MACHINE_PASTE_READ_INTERPRETATION_KIND.CLIPBOARD_FAILURE,
    failureKind,
  };
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
