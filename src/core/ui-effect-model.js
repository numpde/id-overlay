// Stand-alone definition of the canonical overlay UI effect vocabulary.
//
// Effects are semantic commands emitted by pure transition functions. They are
// not DOM operations, API calls, or reducer-internal implementation details.

function defineUiEffect(kind) {
  return Object.freeze({
    kind,
  });
}

export const UI_EFFECT_MODEL = Object.freeze({
  REQUEST_PASTE_INPUT: defineUiEffect(
    "request-paste-input",
  ),
  // Final semantic-history shape: Trace-entry fitting should be a first-class
  // transition such as fit-overlay. This effect should disappear if the solve
  // can remain a pure synchronous transition over current pins.
  REQUEST_REGISTRATION_SOLVE: defineUiEffect(
    "request-registration-solve",
  ),
  CLEAR_PINS: defineUiEffect(
    "clear-pins",
  ),
  CLEAR_IMAGE: defineUiEffect(
    "clear-image",
  ),
  // Final semantic-history shape: undo/redo should dispatch the stored
  // transition record's inverse/replay event through the state machine. These
  // effects should disappear with the snapshot-based store history path.
  UNDO_SESSION: defineUiEffect(
    "undo-session",
  ),
  REDO_SESSION: defineUiEffect(
    "redo-session",
  ),
  SHOW_PASTE_CANCELLED_FEEDBACK: defineUiEffect(
    "show-paste-cancelled-feedback",
  ),
  // Final semantic-history shape: timer effects may remain external commands,
  // but their only job should be scheduling PANEL_TIMEOUT_ELAPSED. They should
  // not imply panel-local confirmation ownership.
  START_PANEL_TIMEOUT: defineUiEffect(
    "start-panel-timeout",
  ),
  CANCEL_PANEL_TIMEOUT: defineUiEffect(
    "cancel-panel-timeout",
  ),
});

export const UI_EFFECT_KIND = Object.freeze(
  Object.fromEntries(
    Object.entries(UI_EFFECT_MODEL).map(([name, definition]) => [name, definition.kind]),
  ),
);
