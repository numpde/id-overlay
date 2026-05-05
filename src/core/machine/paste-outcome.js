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
  if (!isCurrentPasteRequest(state, event) || !isKnownPasteSource(event.source)) {
    return createTransitionResult({ state });
  }
  const outcome = normalizePasteReadOutcome(event.outcome);
  if (!outcome) {
    return createTransitionResult({ state });
  }
  if (outcome.image) {
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
