import test from "node:test";
import assert from "node:assert/strict";

import {
  INPUT_KEY,
  createInputModifiers,
  createKeyboardInputFact,
  createPointerInputFact,
  createWheelInputFact,
} from "../../src/core/input-facts.js";
import {
  createKeyboardInputFactFromEvent,
  createPointerInputFactFromEvent,
  createWheelInputFactFromEvent,
} from "../../src/content/input-event-facts.js";

test("input fact builders normalize primitive input facts", () => {
  assert.deepEqual(createInputModifiers({
    shift: 1,
    alt: 0,
    ctrl: "",
    meta: "yes",
  }), {
    shift: true,
    alt: false,
    ctrl: false,
    meta: true,
  });
  assert.deepEqual(createInputModifiers(null), {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
  });
  assert.deepEqual(createPointerInputFact({
    button: 2,
    buttons: 5,
    modifiers: { shift: true },
  }), {
    button: 2,
    buttons: 5,
    modifiers: {
      shift: true,
      alt: false,
      ctrl: false,
      meta: false,
    },
  });
  assert.deepEqual(createWheelInputFact({
    modifiers: { alt: true },
  }), {
    modifiers: {
      shift: false,
      alt: true,
      ctrl: false,
      meta: false,
    },
  });
  assert.deepEqual(createKeyboardInputFact({
    key: INPUT_KEY.P,
    modifiers: { ctrl: true },
    isDefaultPrevented: 1,
    isEditableTarget: "",
  }), {
    key: INPUT_KEY.P,
    modifiers: {
      shift: false,
      alt: false,
      ctrl: true,
      meta: false,
    },
    isDefaultPrevented: true,
    isEditableTarget: false,
  });
  assert.equal(createKeyboardInputFact({ key: "KeyP" }).key, "");
});

test("content input normalizers are the DOM event boundary", () => {
  const event = {
    button: 1,
    buttons: 3,
    shiftKey: true,
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    code: "KeyP",
    defaultPrevented: false,
    composedPath() {
      return [{
        tagName: "INPUT",
        type: "text",
      }];
    },
  };

  assert.deepEqual(createPointerInputFactFromEvent(event), {
    button: 1,
    buttons: 3,
    modifiers: {
      shift: true,
      alt: false,
      ctrl: true,
      meta: false,
    },
  });
  assert.deepEqual(createWheelInputFactFromEvent(event), {
    modifiers: {
      shift: true,
      alt: false,
      ctrl: true,
      meta: false,
    },
  });
  assert.deepEqual(createKeyboardInputFactFromEvent(event), {
    key: INPUT_KEY.P,
    modifiers: {
      shift: true,
      alt: false,
      ctrl: true,
      meta: false,
    },
    isDefaultPrevented: false,
    isEditableTarget: true,
  });
});

test("content keyboard normalizer treats extension buttons as shortcut-safe", () => {
  assert.equal(createKeyboardInputFactFromEvent({
    composedPath() {
      return [{
        tagName: "BUTTON",
        type: "button",
      }];
    },
  }).isEditableTarget, false);
});
