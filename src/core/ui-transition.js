import { UI_EVENT_KIND } from "./ui-event-model.js";
import { transitionHistory } from "./ui-history-transition.js";
import { transitionMainAction } from "./ui-main-action-transition.js";
import { transitionMode } from "./ui-mode-transition.js";
import { transitionRegistration } from "./ui-registration-transition.js";
import { createUiTransitionResult } from "./ui-transition-result.js";

const MAIN_ACTION_EVENT_KINDS = new Set([
  UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  UI_EVENT_KIND.PANEL_TIMEOUT_ELAPSED,
  UI_EVENT_KIND.PASTE_SUCCEEDED,
  UI_EVENT_KIND.PASTE_CANCELLED,
  UI_EVENT_KIND.PASTE_FAILED,
]);

const MODE_EVENT_KINDS = new Set([
  UI_EVENT_KIND.MODE_SELECTED,
  UI_EVENT_KIND.SOLVE_SUCCEEDED,
  UI_EVENT_KIND.SOLVE_FAILED,
]);

const REGISTRATION_EVENT_KINDS = new Set([
  UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
]);

const HISTORY_EVENT_KINDS = new Set([
  UI_EVENT_KIND.UNDO_TRIGGERED,
  UI_EVENT_KIND.REDO_TRIGGERED,
]);

export function transitionUiState(uiState, event) {
  if (MAIN_ACTION_EVENT_KINDS.has(event?.kind)) {
    return transitionMainAction(uiState, event);
  }

  if (MODE_EVENT_KINDS.has(event?.kind)) {
    return transitionMode(uiState, event);
  }

  if (REGISTRATION_EVENT_KINDS.has(event?.kind)) {
    return transitionRegistration(uiState, event);
  }

  if (HISTORY_EVENT_KINDS.has(event?.kind)) {
    return transitionHistory(uiState, event);
  }

  return createUiTransitionResult(uiState);
}
