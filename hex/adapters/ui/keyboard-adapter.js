export function createKeyboardAdapter({ document, emitInteractionFact }) {
  return {
    bindInput() {
      document.addEventListener("keydown", (event) => {
        if (isSpaceKey(event)) {
          emitInteractionFact({
            kind: "temporary-pass-through-pressed",
          });
          return;
        }
        if (!isPinToggleKey(event)) {
          return;
        }
        emitInteractionFact({
          kind: "registration-pin-toggle-requested",
          source: "shortcut",
        });
      });
      document.addEventListener("keyup", (event) => {
        if (!isSpaceKey(event)) {
          return;
        }
        emitInteractionFact({
          kind: "temporary-pass-through-released",
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
