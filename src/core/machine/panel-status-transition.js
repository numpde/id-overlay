import {
  MACHINE_PANEL_INTENT,
} from "./events.js";
import {
  createIdlePanel,
  isKnownPanelIntent,
  isValidPanelRequestId,
  replacePanel,
  replaceStatus,
} from "./state.js";
import {
  createCancelManualPasteCaptureEffect,
  createCancelPanelTimeoutEffect,
  createReadPasteImageEffect,
  createStartManualPasteCaptureEffect,
  createStartPanelTimeoutEffect,
} from "./effect-requests.js";
import { MACHINE_EFFECT_RESULT_KIND } from "./effect-results.js";
import { isPanelIntentValidForState } from "./policy.js";
import {
  createCancelStatusTimeoutEffects,
  createStatusNotice,
  createTransitionResult,
} from "./transition-result.js";

export function isCurrentPasteRequest(state, event) {
  return (
    state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED &&
    isValidPanelRequestId(event.requestId) &&
    state.panel.requestId === event.requestId
  );
}

export function requestPanelIntent(state, event) {
  if (!isKnownPanelIntent(event.intent)) {
    return createTransitionResult({
      state,
    });
  }
  const intent = event.intent;
  if (intent === MACHINE_PANEL_INTENT.IDLE) {
    return cancelPanelIntent(state);
  }
  if (!isPanelIntentValidForState(state, intent)) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult(beginPanelRequest(state, { intent }));
}

export function cancelPanelIntent(state) {
  const panelTransition = clearPanelIntent(state);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
  });
}

export function cancelPanelIntentWithStatusNotice(state, {
  requestId = null,
  noticeKind,
  noticePayload = null,
} = {}) {
  if (!canCancelPanelIntent(state, { requestId })) {
    return createTransitionResult({ state });
  }
  const cancelled = cancelPanelIntent(state);
  return createTransitionResult({
    state: cancelled.state,
    effects: cancelled.effects,
    statusNotice: createStatusNotice(noticeKind, noticePayload),
  });
}

export function createStatusNoticeResult(state, event) {
  return createTransitionResult({
    state,
    statusNotice: createStatusNotice(event.noticeKind, event.noticePayload),
  });
}

export const PANEL_STATUS_EFFECT_RESULT_TRANSITIONS = Object.freeze({
  [MACHINE_EFFECT_RESULT_KIND.PANEL_TIMEOUT_ELAPSED]: completePanelTimeoutElapsed,
  [MACHINE_EFFECT_RESULT_KIND.STATUS_TIMEOUT_ELAPSED]: clearStatusNotice,
});

export function canCancelPanelIntent(state, event) {
  if (event.requestId == null) {
    return true;
  }
  return isValidPanelRequestId(event.requestId) && state.panel.requestId === event.requestId;
}

export function canLoadImageForRequest(state, event) {
  if (event.requestId == null) {
    return true;
  }
  return isCurrentPasteRequest(state, event);
}

export function clearStatusNotice(state, event) {
  if (!state.status.notice) {
    return createTransitionResult({ state });
  }
  if (event.requestId != null && event.requestId !== state.status.notice.requestId) {
    return createTransitionResult({ state });
  }
  return createTransitionResult({
    state: replaceStatus(state, { notice: null }),
    effects: createCancelStatusTimeoutEffects(state),
  });
}

export function clearPanelIntent(state, nextState = state) {
  return {
    state: replacePanel(nextState, createIdlePanel()),
    effects: createEndPanelRequestEffects(state),
  };
}

export function clearInvalidPanelIntent(state, nextState) {
  if (isPanelIntentValidForState(nextState)) {
    return {
      state: nextState,
      effects: [],
    };
  }
  return clearPanelIntent(state, nextState);
}

function completePanelTimeoutElapsed(state, result) {
  if (!canCancelPanelIntent(state, result)) {
    return createTransitionResult({ state });
  }
  return cancelPanelIntent(state, result);
}

function nextPanelRequestId(state) {
  return state.panel.requestId === null ? 1 : state.panel.requestId + 1;
}

function beginPanelRequest(state, { intent }) {
  const requestId = nextPanelRequestId(state);
  return {
    state: replaceStatus(replacePanel(state, { intent, requestId }), {
      notice: null,
    }),
    effects: [
      ...createEndPanelRequestEffects(state),
      ...createCancelStatusTimeoutEffects(state),
      ...createBeginPanelRequestEffects({ intent, requestId }),
    ],
  };
}

function createEndPanelRequestEffects(state) {
  if (state.panel.requestId === null) {
    return [];
  }
  const effects = [
    createCancelPanelTimeoutEffect({
      requestId: state.panel.requestId,
    }),
  ];
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    effects.push(createCancelManualPasteCaptureEffect({
      requestId: state.panel.requestId,
    }));
  }
  return effects;
}

function createBeginPanelRequestEffects({ intent, requestId }) {
  const timeoutEffect = createStartPanelTimeoutEffect({ intent, requestId });
  if (intent !== MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return [timeoutEffect];
  }
  return [
    createReadPasteImageEffect({ requestId }),
    createStartManualPasteCaptureEffect({ requestId }),
    timeoutEffect,
  ];
}
