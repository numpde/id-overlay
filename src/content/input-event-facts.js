import {
  INPUT_KEY,
  createInputModifiers,
  createKeyboardInputFact,
  createPointerInputFact,
  createWheelInputFact,
} from "../core/input-facts.js";

function createModifiersFromEvent(event) {
  return createInputModifiers({
    shift: event?.shiftKey,
    alt: event?.altKey,
    ctrl: event?.ctrlKey,
    meta: event?.metaKey,
  });
}

export function createPointerInputFactFromEvent(event) {
  return createPointerInputFact({
    button: event?.button,
    buttons: event?.buttons,
    modifiers: createModifiersFromEvent(event),
  });
}

export function createWheelInputFactFromEvent(event) {
  return createWheelInputFact({
    modifiers: createModifiersFromEvent(event),
  });
}

export function createKeyboardInputFactFromEvent(event) {
  // TODO(smell): DOM keyboard fact normalization still decides which editable
  // targets suppress shortcuts, including extension-safe input types. That
  // policy can drift from panel semantics; the DOM boundary should report target
  // facts and let canonical input policy decide shortcut eligibility.
  return createKeyboardInputFact({
    key: resolveKeyboardKey(event?.code),
    modifiers: createModifiersFromEvent(event),
    isDefaultPrevented: event?.defaultPrevented,
    isEditableTarget: isEditableKeyboardTarget(resolveEventTarget(event)),
  });
}

function resolveKeyboardKey(code) {
  switch (code) {
    case "KeyP":
      return INPUT_KEY.P;
    case "Escape":
      return INPUT_KEY.ESCAPE;
    case "Space":
      return INPUT_KEY.SPACE;
    default:
      return "";
  }
}

function resolveEventTarget(event) {
  return event?.composedPath?.()[0] ?? event?.target ?? null;
}

function isEditableKeyboardTarget(target) {
  if (!target || typeof target !== "object") {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
  if (tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (tagName !== "INPUT") {
    return false;
  }
  const type = typeof target.type === "string" ? target.type.toLowerCase() : "";
  return !["button", "range", "checkbox", "radio", "submit", "reset"].includes(type);
}
