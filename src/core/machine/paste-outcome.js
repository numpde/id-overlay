import {
  MACHINE_PASTE_SOURCE,
} from "./events.js";
import {
  cancelPanelIntent,
  isCurrentPasteRequest,
  reportStatusNotice,
} from "./panel-status-transition.js";
import { loadImage } from "./session-transition.js";
import { createTransitionResult } from "./transition-result.js";

export function completePasteRead(state, event) {
  // TODO(smell): Paste completion is modeled as an external machine event whose
  // outcome is still status/load-image-shaped. The final effect result should be
  // a typed paste fact interpreted here into private image/status transitions.
  if (!isCurrentPasteRequest(state, event) || !isKnownPasteSource(event.source)) {
    return createTransitionResult({ state });
  }
  const outcome = normalizePasteReadOutcome(event.outcome);
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
      requestId: event.requestId,
    });
  }
  if (!outcome.noticeKind) {
    return createTransitionResult({ state });
  }
  const statusEvent = {
    noticeKind: outcome.noticeKind,
    noticePayload: outcome.noticePayload,
  };
  if (event.source !== MACHINE_PASTE_SOURCE.MANUAL_PASTE) {
    return reportStatusNotice(state, statusEvent);
  }
  return cancelPanelIntent(state, {
    requestId: event.requestId,
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

function isKnownPasteSource(source) {
  return Object.values(MACHINE_PASTE_SOURCE).includes(source);
}
