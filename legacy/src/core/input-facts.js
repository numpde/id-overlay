export const INPUT_KEY = Object.freeze({
  ESCAPE: "escape",
  P: "p",
  SPACE: "space",
});

const INPUT_KEYS = new Set(Object.values(INPUT_KEY));
const SHORTCUT_SAFE_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isKnownInputKey(key) {
  return INPUT_KEYS.has(key);
}

export function createInputModifiers(modifiers = {}) {
  const {
    shift = false,
    alt = false,
    ctrl = false,
    meta = false,
  } = modifiers ?? {};
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
  target = null,
} = {}) {
  const targetFact = target ? createKeyboardTargetFact(target) : null;
  return {
    key: normalizeInputKey(key),
    modifiers: normalizeInputModifiers(modifiers),
    isDefaultPrevented: Boolean(isDefaultPrevented),
    isEditableTarget: targetFact
      ? isEditableKeyboardTarget(targetFact)
      : Boolean(isEditableTarget),
  };
}

export function createKeyboardTargetFact({
  tagName = "",
  type = "",
  isContentEditable = false,
} = {}) {
  return {
    tagName: normalizeString(tagName).toUpperCase(),
    type: normalizeString(type).toLowerCase(),
    isContentEditable: Boolean(isContentEditable),
  };
}

export function normalizeInputModifiers(modifiers = null) {
  return createInputModifiers(modifiers ?? {});
}

function normalizeInputKey(key) {
  return isKnownInputKey(key) ? key : "";
}

function normalizeInteger(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function normalizeString(value) {
  return typeof value === "string" ? value : "";
}

function isEditableKeyboardTarget(target) {
  if (target.isContentEditable) {
    return true;
  }
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
    return true;
  }
  if (target.tagName !== "INPUT") {
    return false;
  }
  return !SHORTCUT_SAFE_INPUT_TYPES.has(target.type);
}
