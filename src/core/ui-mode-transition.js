import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import { UI_MODE_KIND } from "./ui-state-model.js";
import { createUiTransitionResult } from "./ui-transition-result.js";
import {
  hasOverlayImageSession,
  resolveRegistrationSolveState,
} from "./state.js";

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
  if (!basis.hasImage && basis.nextMode === UI_MODE_KIND.ALIGN) {
    return createUiTransitionResult(uiState);
  }
  if (!isKnownMode(basis.nextMode) || basis.currentMode === basis.nextMode) {
    return createUiTransitionResult(uiState);
  }

  const nextState = patchMode(uiState, basis.nextMode);
  // TODO(machine-cutover): Collapse Trace auto-fit into a single semantic
  // machine transition that owns mode, solve result, and history.
  // Final semantic-history shape: when selecting Trace with computable unsolved
  // pins, this should become a fit-overlay transition with a history record,
  // not "set mode plus request solve". Pure mode switches remain non-history.
  return createUiTransitionResult(
    nextState,
    shouldRequestSolveOnTraceSwitch(basis)
      ? [UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE]
      : [],
  );
}

function transitionSolveSucceeded(uiState, event) {
  // TODO(machine-cutover): Make solve success the completion of a semantic
  // fit-overlay transition, not a free-standing registration mutation.
  // Final semantic-history shape: a successful solve caused by fit-overlay
  // should commit that semantic transition, including undo/redo events. This
  // outcome should not remain an untracked registration mutation.
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
    registrationStatus === "dirty"
  );
}

function resolveRegistrationStatus(uiState) {
  return resolveRegistrationSolveState(uiState.session.registration).kind;
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
  return hasOverlayImageSession(uiState.session);
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
