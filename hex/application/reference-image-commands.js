import {
  pushHistory,
} from "./history.js";
import {
  selectDurableApplicationState,
} from "./view-model.js";
import {
  persistDurableStateEffect,
  requestReferenceImageInputEffect,
  replaceReferenceImageInputIntent,
  scheduleClearStatusNoticeEffect,
} from "./effects.js";

export function requestReferenceImageReplacement(state, { inertResult }) {
  if (!state.session) {
    return inertResult(state);
  }

  const requestId = 1;
  const intent = replaceReferenceImageInputIntent();
  return {
    state: {
      session: state.session,
      ...historyState(state),
      referenceImageInput: {
        status: "awaiting-input",
        requestId,
        intent,
      },
    },
    effects: [requestReferenceImageInputEffect({ requestId, intent })],
  };
}

export function clearReferenceImageWithHistory(state) {
  const record = {
    kind: "remove-reference-image",
    before: selectDurableApplicationState(state),
    after: null,
  };
  return {
    state: {
      history: pushHistory(state.history, record),
      notice: {
        kind: "reference-image-cleared",
      },
    },
    effects: [persistDurableStateEffect(null)],
  };
}

export function reportReferenceImageInputOutcome(state, command, { inertResult }) {
  if (state.referenceImageInput?.requestId !== command.requestId) {
    return inertResult(state);
  }
  if (isReplacementReferenceImageInput(state)) {
    return reportReferenceImageReplacementOutcome(state, command);
  }
  if (command.outcome?.kind === "empty") {
    return {
      state: {
        notice: {
          kind: "reference-image-input-empty",
          requestId: command.requestId,
        },
      },
      effects: [scheduleClearStatusNoticeEffect(command.requestId)],
    };
  }
  if (command.outcome?.kind === "failed") {
    return {
      state: {
        notice: {
          kind: "reference-image-input-failed",
          reason: command.outcome.reason,
          requestId: command.requestId,
        },
      },
      effects: [scheduleClearStatusNoticeEffect(command.requestId)],
    };
  }

  const session = {
    mode: "align",
    referenceImage: command.outcome.referenceImage,
  };
  if (command.outcome.placement !== undefined) {
    session.placement = command.outcome.placement;
  }
  const durableState = { session };
  const record = {
    kind: "load-reference-image",
    before: null,
    after: durableState,
  };
  return {
    state: {
      session,
      history: pushHistory(state.history, record),
      notice: {
        kind: "reference-image-loaded",
        referenceImage: command.outcome.referenceImage,
      },
    },
    effects: [persistDurableStateEffect(durableState)],
  };
}

export function isReplacementReferenceImageInput(state) {
  return Boolean(
    state.session
      && state.referenceImageInput?.intent?.kind === "replace-reference-image",
  );
}

function reportReferenceImageReplacementOutcome(state, command) {
  if (command.outcome?.kind === "empty") {
    return replacementInputNoticeResult({
      state,
      notice: {
        kind: "reference-image-replacement-empty",
        requestId: command.requestId,
      },
      requestId: command.requestId,
    });
  }
  if (command.outcome?.kind === "failed") {
    return replacementInputNoticeResult({
      state,
      notice: {
        kind: "reference-image-replacement-failed",
        reason: command.outcome.reason,
        requestId: command.requestId,
      },
      requestId: command.requestId,
    });
  }

  const session = {
    mode: "align",
    referenceImage: command.outcome.referenceImage,
  };
  const nextDurableState = { session };
  const record = {
    kind: "replace-reference-image",
    before: selectDurableApplicationState(state),
    after: nextDurableState,
  };
  return {
    state: {
      session,
      history: pushHistory(state.history, record),
      notice: {
        kind: "reference-image-loaded",
        referenceImage: command.outcome.referenceImage,
      },
    },
    effects: [persistDurableStateEffect(nextDurableState)],
  };
}

function replacementInputNoticeResult({ state, notice, requestId }) {
  return {
    state: {
      session: state.session,
      ...historyState(state),
      notice,
    },
    effects: [scheduleClearStatusNoticeEffect(requestId)],
  };
}

function historyState(state) {
  if (!state.history) {
    return {};
  }
  return {
    history: state.history,
  };
}
