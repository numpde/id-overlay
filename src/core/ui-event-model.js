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
  RUNTIME: "runtime",
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
  OPACITY_SET: defineUiEvent(
    "opacity-set",
    UI_EVENT_FAMILY_KIND.INTENT,
    ["opacity"],
  ),
  PIN_ADDED: defineUiEvent(
    "pin-added",
    UI_EVENT_FAMILY_KIND.INTENT,
    ["pin"],
  ),
  PIN_REMOVED: defineUiEvent(
    "pin-removed",
    UI_EVENT_FAMILY_KIND.INTENT,
    ["pinId"],
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
  SESSION_RESTORED: defineUiEvent(
    "session-restored",
    UI_EVENT_FAMILY_KIND.OUTCOME,
    ["session"],
  ),

  // Ephemeral runtime facts that still belong to canonical runtime state.
  POINTER_MOVED: defineUiEvent(
    "pointer-moved",
    UI_EVENT_FAMILY_KIND.RUNTIME,
    ["screenPx"],
  ),
  ACTIVE_GESTURE_CHANGED: defineUiEvent(
    "active-gesture-changed",
    UI_EVENT_FAMILY_KIND.RUNTIME,
    ["activeGesture"],
  ),
  INPUT_OVERRIDE_CHANGED: defineUiEvent(
    "input-override-changed",
    UI_EVENT_FAMILY_KIND.RUNTIME,
    ["inputOverride"],
  ),

  // Timer/system-driven state updates.
  PANEL_TIMEOUT_ELAPSED: defineUiEvent(
    "panel-timeout-elapsed",
    UI_EVENT_FAMILY_KIND.SYSTEM,
  ),
  STATUS_MESSAGE_OVERRIDE_SET: defineUiEvent(
    "status-message-override-set",
    UI_EVENT_FAMILY_KIND.SYSTEM,
    ["message"],
  ),
  STATUS_MESSAGE_OVERRIDE_CLEARED: defineUiEvent(
    "status-message-override-cleared",
    UI_EVENT_FAMILY_KIND.SYSTEM,
  ),
});

export const UI_EVENT_KIND = Object.freeze(
  Object.fromEntries(
    Object.entries(UI_EVENT_MODEL).map(([name, definition]) => [name, definition.kind]),
  ),
);
