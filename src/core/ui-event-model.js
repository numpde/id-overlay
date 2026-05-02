// Stand-alone definition of the canonical overlay UI event vocabulary.
//
// This file defines only:
// - semantic UI event families
// - the canonical event kind vocabulary
// - the payload-key shape for each event kind
// - the reducer family that owns each event kind
//
// It does not define transition execution, reducer implementation, or side-effect execution.
//
// The intent is to keep the event vocabulary:
// - semantic
// - inspectable
// - small
// - separate from DOM/input plumbing and reducer-internal action names

export const UI_EVENT_FAMILY_KIND = Object.freeze({
  INTENT: "intent",
  OUTCOME: "outcome",
  SYSTEM: "system",
});

export const UI_EVENT_TRANSITION_KIND = Object.freeze({
  MAIN_ACTION: "main-action",
  MODE: "mode",
  REGISTRATION: "registration",
  HISTORY: "history",
});

function defineUiEvent(kind, family, transitionKind, payloadKeys = []) {
  return Object.freeze({
    kind,
    family,
    transitionKind,
    payloadKeys: Object.freeze([...payloadKeys]),
  });
}

export const UI_EVENT_MODEL = Object.freeze({
  // High-level user intents. These are not button-specific or DOM-specific.
  MAIN_ACTION_TRIGGERED: defineUiEvent(
    "main-action-triggered",
    UI_EVENT_FAMILY_KIND.INTENT,
    UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
  ),
  MODE_SELECTED: defineUiEvent(
    "mode-selected",
    UI_EVENT_FAMILY_KIND.INTENT,
    UI_EVENT_TRANSITION_KIND.MODE,
    ["mode"],
  ),
  CLEAR_PINS_TRIGGERED: defineUiEvent(
    "clear-pins-triggered",
    UI_EVENT_FAMILY_KIND.INTENT,
    UI_EVENT_TRANSITION_KIND.REGISTRATION,
  ),
  // Final semantic-history shape: these remain user intents, but they should
  // be resolved by the state machine into the stored record's undoEvent or
  // redoEvent. They should not emit an effect that bypasses transition
  // semantics to restore a raw store snapshot.
  UNDO_TRIGGERED: defineUiEvent(
    "undo-triggered",
    UI_EVENT_FAMILY_KIND.INTENT,
    UI_EVENT_TRANSITION_KIND.HISTORY,
  ),
  REDO_TRIGGERED: defineUiEvent(
    "redo-triggered",
    UI_EVENT_FAMILY_KIND.INTENT,
    UI_EVENT_TRANSITION_KIND.HISTORY,
  ),

  // External outcomes that feed back into canonical UI state.
  PASTE_SUCCEEDED: defineUiEvent(
    "paste-succeeded",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
    ["image", "placement"],
  ),
  PASTE_CANCELLED: defineUiEvent(
    "paste-cancelled",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
  ),
  PASTE_FAILED: defineUiEvent(
    "paste-failed",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
    ["reason"],
  ),
  // Final semantic-history shape: fit-overlay should be a first-class
  // state-machine transition. If solving remains external, this outcome should
  // commit that transition's history record, not act as an untracked mutation.
  SOLVE_SUCCEEDED: defineUiEvent(
    "solve-succeeded",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    UI_EVENT_TRANSITION_KIND.MODE,
    ["solvedTransform"],
  ),
  SOLVE_FAILED: defineUiEvent(
    "solve-failed",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    UI_EVENT_TRANSITION_KIND.MODE,
    ["reason"],
  ),

  // Timer/system-driven state updates.
  PANEL_TIMEOUT_ELAPSED: defineUiEvent(
    "panel-timeout-elapsed",
    UI_EVENT_FAMILY_KIND.SYSTEM,
    UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
  ),
});

export const UI_EVENT_KIND = Object.freeze(
  Object.fromEntries(
    Object.entries(UI_EVENT_MODEL).map(([name, definition]) => [name, definition.kind]),
  ),
);

const UI_EVENT_TRANSITION_KIND_BY_EVENT_KIND = Object.freeze(
  Object.fromEntries(
    Object.values(UI_EVENT_MODEL).map((definition) => [
      definition.kind,
      definition.transitionKind,
    ]),
  ),
);

export function getUiEventTransitionKind(eventKind) {
  return UI_EVENT_TRANSITION_KIND_BY_EVENT_KIND[eventKind] ?? null;
}
