// Stand-alone definition of the canonical overlay UI event vocabulary.
//
// This file defines only:
// - semantic UI event families
// - the canonical event kind vocabulary
// - the payload-key shape for each event kind
//
// It does not define transitions, reducers, or side-effect execution.
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

function defineUiEvent(kind, family, payloadKeys = []) {
  return Object.freeze({
    kind,
    family,
    payloadKeys: Object.freeze([...payloadKeys]),
  });
}

export const UI_EVENT_MODEL = Object.freeze({
  // High-level user intents. These are not button-specific or DOM-specific.
  MAIN_ACTION_TRIGGERED: defineUiEvent(
    "main-action-triggered",
    UI_EVENT_FAMILY_KIND.INTENT,
  ),
  MODE_SELECTED: defineUiEvent(
    "mode-selected",
    UI_EVENT_FAMILY_KIND.INTENT,
    ["mode"],
  ),
  CLEAR_PINS_TRIGGERED: defineUiEvent(
    "clear-pins-triggered",
    UI_EVENT_FAMILY_KIND.INTENT,
  ),

  // External outcomes that feed back into canonical UI state.
  PASTE_SUCCEEDED: defineUiEvent(
    "paste-succeeded",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    ["image", "placement"],
  ),
  PASTE_CANCELLED: defineUiEvent(
    "paste-cancelled",
    UI_EVENT_FAMILY_KIND.OUTCOME,
  ),
  PASTE_FAILED: defineUiEvent(
    "paste-failed",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    ["reason"],
  ),
  SOLVE_SUCCEEDED: defineUiEvent(
    "solve-succeeded",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    ["solvedTransform"],
  ),
  SOLVE_FAILED: defineUiEvent(
    "solve-failed",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    ["reason"],
  ),

  // Timer/system-driven state updates.
  PANEL_TIMEOUT_ELAPSED: defineUiEvent(
    "panel-timeout-elapsed",
    UI_EVENT_FAMILY_KIND.SYSTEM,
  ),
});

export const UI_EVENT_KIND = Object.freeze(
  Object.fromEntries(
    Object.entries(UI_EVENT_MODEL).map(([name, definition]) => [name, definition.kind]),
  ),
);
