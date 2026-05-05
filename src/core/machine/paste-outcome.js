import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../clipboard-facts.js";
import {
  MACHINE_PASTE_SOURCE,
  MACHINE_STATUS_NOTICE_KIND,
} from "./events.js";
import {
  cancelPanelIntent,
  isCurrentPasteRequest,
  reportStatusNotice,
} from "./panel-status-transition.js";
import { loadImage } from "./session-transition.js";
import { createTransitionResult } from "./transition-result.js";
import { createPlacementTransform } from "../transform.js";

export function completePasteRead(state, result) {
  // TODO(smell): Paste completion now enters as a typed effect result, but its
  // outcome is still the legacy image/status union. Collapse that next so paste
  // interpretation starts from clipboard facts, page facts, and machine policy.
  if (!isCurrentPasteRequest(state, result) || !isKnownPasteSource(result.source)) {
    return createTransitionResult({ state });
  }
  const outcome = normalizePasteReadOutcome(result.outcome);
  if (!outcome) {
    return createTransitionResult({ state });
  }
  if (outcome.image) {
    // TODO(smell): Paste completion re-enters loadImage via an event-shaped
    // object. Once image load is a private domain operation, pass typed image
    // facts directly instead of constructing transition-event payloads.
    return loadImage(state, {
      image: outcome.image,
      placement: outcome.placement,
      requestId: result.requestId,
    });
  }
  if (!outcome.noticeKind) {
    return createTransitionResult({ state });
  }
  const statusEvent = {
    noticeKind: outcome.noticeKind,
    noticePayload: outcome.noticePayload,
  };
  if (result.source !== MACHINE_PASTE_SOURCE.MANUAL_PASTE) {
    return reportStatusNotice(state, statusEvent);
  }
  return cancelPanelIntent(state, {
    requestId: result.requestId,
    ...statusEvent,
  });
}

export function normalizePasteReadOutcome(outcome) {
  // TODO(smell): Normalization preserves the legacy paste outcome union: image,
  // placement, or notice fields. Replace this with one explicit decoded-image /
  // clipboard-failure result shape before the paste adapter stops authoring
  // status-shaped outcomes.
  if (!outcome) {
    return null;
  }
  if (outcome.image || outcome.noticeKind) {
    return {
      image: outcome.image ?? null,
      placement: outcome.placement ?? null,
      noticeKind: outcome.noticeKind,
      noticePayload: outcome.noticePayload ?? null,
    };
  }
  return {
    image: outcome,
    placement: null,
    noticeKind: undefined,
    noticePayload: null,
  };
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
    return createClipboardStatusPasteOutcome({
      noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
    });
  }
  if (fact.kind === CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE) {
    return createClipboardStatusPasteOutcome({
      noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_IMAGE_UNREADABLE,
    });
  }
  return null;
}

function createDecodedImagePasteOutcome({ image, snapshot }) {
  if (!image) {
    return null;
  }
  return {
    image,
    placement: snapshot ? createPlacementTransform({
      image,
      centerMapLatLon: snapshot.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: snapshot.mapView.zoom,
    }) : null,
  };
}

function createClipboardStatusPasteOutcome({ noticeKind, noticePayload = null }) {
  return {
    image: null,
    placement: null,
    noticeKind,
    noticePayload,
  };
}

function isKnownPasteSource(source) {
  return Object.values(MACHINE_PASTE_SOURCE).includes(source);
}
