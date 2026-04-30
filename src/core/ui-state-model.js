// Stand-alone definition of the coupled overlay UI state shape.
//
// This file defines only:
// - the vocabulary for the current user-facing state
// - the canonical nested shape of that state
// - the initial state factory
//
// It does not define transitions or validity rules.
//
// The intent is to describe primary state only:
// - raw durable session facts
// - raw ephemeral interaction facts
// - raw transient panel state
// - raw transient status state
//
// Derived views such as:
// - "can capture pointer"
// - "pass-through active"
// - "pointer is inside the image"
// - "current visible status message"
//
// do not belong here.

export const UI_MODE_KIND = Object.freeze({
  ALIGN: "align",
  TRACE: "trace",
});

export const UI_ACTIVE_GESTURE_KIND = Object.freeze({
  MAP_PAN: "map-pan",
  MOVE_OVERLAY: "move-overlay",
});

export const UI_INPUT_OVERRIDE_KIND = Object.freeze({
  PASS_THROUGH: "pass-through",
});

export const UI_PANEL_INTENT_KIND = Object.freeze({
  IDLE: "idle",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS_CONFIRM: "clear-pins-confirm",
  CLEAR_IMAGE_CONFIRM: "clear-image-confirm",
});

export function createInitialUiState() {
  return {
    // Durable overlay/session reality.
    session: {
      mode: UI_MODE_KIND.TRACE,
      opacity: 0.6,
      image: null,
      placement: null,
      registration: {
        pins: [],
        solvedTransform: null,
        dirty: false,
      },
    },

    // Ephemeral interaction reality.
    //
    // `pointer.screenPx` is the current shared pointer point in the same
    // coordinate space used by map/screen transform helpers.
    //
    // `activeGesture` is either `null` or a value from
    // `UI_ACTIVE_GESTURE_KIND`. Wheel/click interactions do not persist here;
    // only sustained gesture ownership does.
    //
    // `inputOverride` is either `null` or a value from
    // `UI_INPUT_OVERRIDE_KIND`.
    runtime: {
      pointer: {
        screenPx: null,
      },
      activeGesture: null,
      inputOverride: null,
    },

    // Transient panel button/confirmation state.
    panel: {
      intent: UI_PANEL_INTENT_KIND.IDLE,
    },

    // Stored status state only. The visible status text is otherwise
    // derived from session and runtime.
    status: {
      messageOverride: null,
    },
  };
}
