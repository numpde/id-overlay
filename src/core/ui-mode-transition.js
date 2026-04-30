import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import { UI_MODE_KIND } from "./ui-state-model.js";
import { createUiTransitionResult } from "./ui-transition-result.js";

export const UI_REGISTRATION_STATUS_KIND = Object.freeze({
  EMPTY: "empty",
  INSUFFICIENT_PINS: "insufficient-pins",
  READY: "ready",
  DIRTY: "dirty",
  SOLVED: "solved",
});

export function resolveModeTransitionBasis(uiState, nextMode = uiState.session.mode) {
  return {
    currentMode: uiState.session.mode,
    nextMode,
    hasImage: hasImage(uiState),
    registrationStatus: resolveRegistrationStatus(uiState),
  };
}

export function transitionMode(uiState, event) {
  switch (event?.kind) {
    case UI_EVENT_KIND.MODE_SELECTED:
      return transitionModeSelected(uiState, event.mode);
    case UI_EVENT_KIND.SOLVE_SUCCEEDED:
      return transitionSolveSucceeded(uiState, event);
    case UI_EVENT_KIND.SOLVE_FAILED:
      return transitionSolveFailed(uiState);
    default:
      return createUiTransitionResult(uiState);
  }
}

function transitionModeSelected(uiState, nextMode) {
  const basis = resolveModeTransitionBasis(uiState, nextMode);
  if (!isKnownMode(basis.nextMode) || basis.currentMode === basis.nextMode) {
    return createUiTransitionResult(uiState);
  }

  const nextState = patchMode(uiState, basis.nextMode);
  return createUiTransitionResult(
    nextState,
    shouldRequestSolveOnTraceSwitch(basis)
      ? [UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE]
      : [],
  );
}

function transitionSolveSucceeded(uiState, event) {
  if (!hasImage(uiState)) {
    return createUiTransitionResult(uiState);
  }

  const solvedTransform = event.solvedTransform ?? null;
  if (!solvedTransform) {
    return createUiTransitionResult(uiState);
  }

  const nextRegistration = {
    ...uiState.session.registration,
    solvedTransform,
    dirty: false,
  };

  if (isEquivalentSolvedRegistration(nextRegistration, uiState.session.registration)) {
    return createUiTransitionResult(uiState);
  }

  return createUiTransitionResult({
    ...uiState,
    session: {
      ...uiState.session,
      registration: nextRegistration,
    },
  });
}

function transitionSolveFailed(uiState) {
  return createUiTransitionResult(uiState);
}

function shouldRequestSolveOnTraceSwitch({
  currentMode,
  nextMode,
  hasImage,
  registrationStatus,
}) {
  return (
    currentMode !== UI_MODE_KIND.TRACE &&
    nextMode === UI_MODE_KIND.TRACE &&
    hasImage &&
    registrationStatus === UI_REGISTRATION_STATUS_KIND.DIRTY
  );
}

function resolveRegistrationStatus(uiState) {
  const registration = uiState.session.registration;
  const pinCount = Array.isArray(registration?.pins) ? registration.pins.length : 0;
  const isDirty = Boolean(registration?.dirty);
  const hasSolvedTransform = Boolean(registration?.solvedTransform);

  if (hasSolvedTransform && !isDirty) {
    return UI_REGISTRATION_STATUS_KIND.SOLVED;
  }
  if (pinCount >= 2 && isDirty) {
    return UI_REGISTRATION_STATUS_KIND.DIRTY;
  }
  if (pinCount >= 2) {
    return UI_REGISTRATION_STATUS_KIND.READY;
  }
  if (pinCount > 0) {
    return UI_REGISTRATION_STATUS_KIND.INSUFFICIENT_PINS;
  }
  return UI_REGISTRATION_STATUS_KIND.EMPTY;
}

function patchMode(uiState, mode) {
  return {
    ...uiState,
    session: {
      ...uiState.session,
      mode,
    },
  };
}

function hasImage(uiState) {
  return uiState.session.image !== null;
}

function isKnownMode(mode) {
  return mode === UI_MODE_KIND.ALIGN || mode === UI_MODE_KIND.TRACE;
}

function isEquivalentSolvedRegistration(left, right) {
  return (
    left?.dirty === right?.dirty &&
    solvedTransformsEqual(left?.solvedTransform, right?.solvedTransform)
  );
}

function solvedTransformsEqual(left, right) {
  return (
    left?.type === right?.type &&
    left?.pinCount === right?.pinCount &&
    left?.scale === right?.scale &&
    left?.rotationRad === right?.rotationRad &&
    left?.translate?.x === right?.translate?.x &&
    left?.translate?.y === right?.translate?.y
  );
}
