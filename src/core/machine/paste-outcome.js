import {
  createLoadImageEvent,
  createReportFeedbackEvent,
} from "./events.js";

export function createPasteReadOutcomeEvent(outcome, { requestId = null } = {}) {
  const normalizedOutcome = normalizePasteReadOutcome(outcome);
  if (!normalizedOutcome) {
    return null;
  }
  if (normalizedOutcome.image) {
    return createLoadImageEvent({
      image: normalizedOutcome.image,
      placement: normalizedOutcome.placement,
      requestId,
      feedbackMessage: normalizedOutcome.feedbackMessage,
    });
  }
  if (normalizedOutcome.message) {
    return createReportFeedbackEvent({
      feedbackKind: normalizedOutcome.feedbackKind,
      message: normalizedOutcome.message,
    });
  }
  return null;
}

export function normalizePasteReadOutcome(outcome) {
  if (!outcome) {
    return null;
  }
  if (outcome.image || outcome.message) {
    return {
      image: outcome.image ?? null,
      placement: outcome.placement ?? null,
      feedbackMessage: outcome.feedbackMessage ?? "",
      feedbackKind: outcome.feedbackKind,
      message: outcome.message ?? "",
    };
  }
  return {
    image: outcome,
    placement: null,
    feedbackMessage: "",
    feedbackKind: undefined,
    message: "",
  };
}
