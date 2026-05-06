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
} from "./effects.js";
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
  // TODO(smell): Panel request lifecycle still hand-builds request ids,
  // cancellation ordering, and timeout/capture effects in one transition
  // branch. The final shape should isolate request transactions so intent
  // handlers declare the requested intent and receive state/effect deltas.
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
  const requestId = nextPanelRequestId(state);
  const nextState = replaceStatus(replacePanel(state, { intent, requestId }), {
    notice: null,
  });
  return createTransitionResult({
    state: nextState,
    effects: [
      ...createCancelPanelIntentEffects(state),
      ...createCancelStatusTimeoutEffects(state),
      ...createPanelIntentEffects({ intent, requestId }),
    ],
  });
}

export function cancelPanelIntent(state) {
  const panelTransition = clearPanelIntent(state);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
  });
}

export function reportStatusNotice(state, event) {
  // TODO(smell): Status reporting is a public transition command today. Runtime,
  // paste, and interaction failures should report typed facts; this module
  // should derive notices from those facts inside the machine.
  return createTransitionResult({
    state,
    statusNotice: createStatusNotice(event.noticeKind, event.noticePayload),
  });
}

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
    effects: createCancelPanelIntentEffects(state),
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

function nextPanelRequestId(state) {
  return state.panel.requestId === null ? 1 : state.panel.requestId + 1;
}

function createCancelPanelIntentEffects(state) {
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

function createPanelIntentEffects({ intent, requestId }) {
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
