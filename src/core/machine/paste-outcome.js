import {
  createLoadImageEvent,
  createReportStatusNoticeEvent,
} from "./events.js";

export function createPasteReadOutcomeEvent(outcome, { requestId = null } = {}) {
  // TODO(smell): Paste outcome translation returns only one follow-up event,
  // which forces the effect runner to know which outcomes also close the panel
  // request. The final shape should make this mapper produce the complete
  // ordered response to a paste result.
  const normalizedOutcome = normalizePasteReadOutcome(outcome);
  if (!normalizedOutcome) {
    return null;
  }
  if (normalizedOutcome.image) {
    return createLoadImageEvent({
      image: normalizedOutcome.image,
      placement: normalizedOutcome.placement,
      requestId,
    });
  }
  if (normalizedOutcome.noticeKind) {
    return createReportStatusNoticeEvent({
      noticeKind: normalizedOutcome.noticeKind,
      noticePayload: normalizedOutcome.noticePayload,
    });
  }
  return null;
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
