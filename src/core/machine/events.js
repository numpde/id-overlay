import { SESSION_MODE } from "../session.js";

export const MACHINE_MODE = SESSION_MODE;

export const MACHINE_PANEL_INTENT = Object.freeze({
  IDLE: "idle",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS_CONFIRM: "clear-pins-confirm",
  CLEAR_IMAGE_CONFIRM: "clear-image-confirm",
});

export const MACHINE_HISTORY_KIND = Object.freeze({
  LOAD_IMAGE: "load-image",
  CLEAR_IMAGE: "clear-image",
  ADD_PIN: "add-pin",
  REMOVE_PIN: "remove-pin",
  CLEAR_PINS: "clear-pins",
  FIT_OVERLAY: "fit-overlay",
  MOVE_OVERLAY: "move-overlay",
  ROTATE_OVERLAY: "rotate-overlay",
  SCALE_OVERLAY: "scale-overlay",
});

export const MACHINE_PLACEMENT_EDIT_KIND = Object.freeze({
  MOVE: "move",
  ROTATE: "rotate",
  SCALE: "scale",
});

export const MACHINE_POINTER_GESTURE_KIND = Object.freeze({
  MAP_PAN: "map-pan",
  MOVE_OVERLAY: "move-overlay",
});

export const MACHINE_INPUT_OVERRIDE = Object.freeze({
  PASS_THROUGH: "pass-through",
});
