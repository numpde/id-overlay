// Stand-alone definition of the canonical overlay UI effect vocabulary.
//
// Effects are semantic commands emitted by pure transition functions. They are
// not DOM operations, API calls, or reducer-internal implementation details.

function defineUiEffect(kind, payloadKeys = []) {
  return Object.freeze({
    kind,
    payloadKeys: Object.freeze([...payloadKeys]),
  });
}

export const UI_EFFECT_MODEL = Object.freeze({
  REQUEST_PASTE_INPUT: defineUiEffect(
    "request-paste-input",
  ),
  REQUEST_REGISTRATION_SOLVE: defineUiEffect(
    "request-registration-solve",
  ),
  CLEAR_PINS: defineUiEffect(
    "clear-pins",
  ),
  CLEAR_IMAGE: defineUiEffect(
    "clear-image",
  ),
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
