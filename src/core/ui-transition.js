import {
  getUiEventTransitionKind,
  UI_EVENT_TRANSITION_KIND,
} from "./ui-event-model.js";
import { transitionHistory } from "./ui-history-transition.js";
import { transitionMainAction } from "./ui-main-action-transition.js";
import { transitionMode } from "./ui-mode-transition.js";
import { transitionRegistration } from "./ui-registration-transition.js";
import { createUiTransitionResult } from "./ui-transition-result.js";

const TRANSITION_BY_KIND = Object.freeze({
  [UI_EVENT_TRANSITION_KIND.MAIN_ACTION]: transitionMainAction,
  [UI_EVENT_TRANSITION_KIND.MODE]: transitionMode,
  [UI_EVENT_TRANSITION_KIND.REGISTRATION]: transitionRegistration,
  // Final semantic-history shape: history remains a reducer family, but it
  // should route undo/redo to stored transition events instead of emitting
  // side-effect commands that call store.undo()/store.redo().
  [UI_EVENT_TRANSITION_KIND.HISTORY]: transitionHistory,
});

export function transitionUiState(uiState, event) {
  const transition = TRANSITION_BY_KIND[getUiEventTransitionKind(event?.kind)];
  return transition?.(uiState, event) ?? createUiTransitionResult(uiState);
}
