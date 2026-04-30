import { UI_EVENT_KIND } from "./ui-event-model.js";
import { transitionMainAction } from "./ui-main-action-transition.js";
import { transitionMode } from "./ui-mode-transition.js";
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

export function transitionUiState(uiState, event) {
  if (MAIN_ACTION_EVENT_KINDS.has(event?.kind)) {
    return transitionMainAction(uiState, event);
  }

  if (MODE_EVENT_KINDS.has(event?.kind)) {
    return transitionMode(uiState, event);
  }

  return createUiTransitionResult(uiState);
}
