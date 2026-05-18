export function createKeyboardAdapter({
  document,
  ownerWindow = document.defaultView,
  emitInteractionFact,
}) {
  let bound = false;
  const blurTarget = ownerWindow ?? document;

  return {
    bindInput() {
      if (bound) {
        return;
      }
      bound = true;
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);
      blurTarget.addEventListener("blur", handleBlur);
    },
    destroy() {
      if (!bound) {
        return;
      }
      bound = false;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      blurTarget.removeEventListener("blur", handleBlur);
    },
  };

  function handleKeyDown(event) {
    if (isEditableTarget(event.target)) {
      return;
    }
    if (isSpaceKey(event)) {
      event.preventDefault();
      emitInteractionFact({
        kind: "temporary-native-map-access-started",
      });
      return;
    }
    if (isEscapeKey(event)) {
      event.preventDefault();
      emitInteractionFact({
        kind: "trace-mode-requested",
      });
      return;
    }
    if (!isPinToggleKey(event)) {
      return;
    }
    event.preventDefault();
    emitInteractionFact({
      kind: "registration-pin-toggle-requested",
    });
  }

  function handleKeyUp(event) {
    if (isEditableTarget(event.target)) {
      return;
    }
    if (!isSpaceKey(event)) {
      return;
    }
    event.preventDefault();
    emitInteractionFact({
      kind: "temporary-native-map-access-ended",
    });
  }

  function handleBlur() {
    emitInteractionFact({
      kind: "interaction-reset-requested",
    });
  }
}

function isSpaceKey(event) {
  return event.code === "Space" || event.key === " ";
}

function isPinToggleKey(event) {
  return event.code === "KeyP" || event.key?.toLowerCase() === "p";
}

function isEscapeKey(event) {
  return event.code === "Escape" || event.key === "Escape";
}

function isEditableTarget(target) {
  if (!target || target.nodeType !== 1) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
