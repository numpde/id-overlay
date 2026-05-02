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
//
// Derived views such as:
// - "can capture pointer"
// - "pass-through active"
// - "pointer is inside the image"
// - "current visible status message"
//
// do not belong here.

import { INTERACTION_MODE } from "./interaction-mode.js";
import {
  DEFAULT_SESSION_MODE,
  DEFAULT_SESSION_OPACITY,
} from "./session-defaults.js";

export const UI_MODE_KIND = INTERACTION_MODE;

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
      mode: DEFAULT_SESSION_MODE,
      opacity: DEFAULT_SESSION_OPACITY,
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

    // Final semantic-history shape: canonical undo/redo records likely belong
    // in this machine state shape, not in the lower-level session store. Add
    // them here during the cut-over rather than threading descriptor inputs
    // through view-model calls.
  };
}
