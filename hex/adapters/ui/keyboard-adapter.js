export function createKeyboardAdapter({ document, emitInteractionFact }) {
  return {
    bindInput() {
      document.addEventListener("keydown", (event) => {
        if (!isSpaceKey(event)) {
          return;
        }
        emitInteractionFact({
          kind: "temporary-pass-through-pressed",
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
