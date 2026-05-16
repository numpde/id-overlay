export function createKeyboardAdapter({ document, emitInteractionFact }) {
  return {
    bindInput() {
      document.addEventListener("keydown", (event) => {
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
      });
      document.addEventListener("keyup", (event) => {
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
      });
      document.addEventListener("blur", () => {
        emitInteractionFact({
          kind: "interaction-reset-requested",
        });
      });
    },
  };
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
