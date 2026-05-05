export const INPUT_KEY = Object.freeze({
  ESCAPE: "escape",
  P: "p",
  SPACE: "space",
});

export function createInputModifiers({
  shift = false,
  alt = false,
  ctrl = false,
  meta = false,
} = {}) {
  return {
    shift: Boolean(shift),
    alt: Boolean(alt),
    ctrl: Boolean(ctrl),
    meta: Boolean(meta),
  };
}

export function createPointerInputFact({
  button = 0,
  buttons = 0,
  modifiers = null,
} = {}) {
  return {
    button: normalizeInteger(button, 0),
    buttons: normalizeInteger(buttons, 0),
    modifiers: normalizeInputModifiers(modifiers),
  };
}

export function createWheelInputFact({
  modifiers = null,
} = {}) {
  return {
    modifiers: normalizeInputModifiers(modifiers),
  };
}

export function createKeyboardInputFact({
  key = "",
  modifiers = null,
  isDefaultPrevented = false,
  isEditableTarget = false,
} = {}) {
  return {
    key: typeof key === "string" ? key : "",
    modifiers: normalizeInputModifiers(modifiers),
    isDefaultPrevented: Boolean(isDefaultPrevented),
    isEditableTarget: Boolean(isEditableTarget),
  };
}

export function normalizeInputModifiers(modifiers = null) {
  return createInputModifiers(modifiers ?? {});
}

function normalizeInteger(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}
