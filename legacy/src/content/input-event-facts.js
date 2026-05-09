import {
  INPUT_KEY,
  createInputModifiers,
  createKeyboardInputFact,
  createKeyboardTargetFact,
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
  return createKeyboardInputFact({
    key: resolveKeyboardKey(event?.code),
    modifiers: createModifiersFromEvent(event),
    isDefaultPrevented: event?.defaultPrevented,
    target: createKeyboardTargetFactFromEventTarget(resolveEventTarget(event)),
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

function createKeyboardTargetFactFromEventTarget(target) {
  if (!target || typeof target !== "object") {
    return createKeyboardTargetFact();
  }
  return createKeyboardTargetFact({
    tagName: target.tagName,
    type: target.type,
    isContentEditable: target.isContentEditable,
  });
}
