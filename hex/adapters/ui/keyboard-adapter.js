export function createKeyboardAdapter({ document, emitInteractionFact }) {
  return {
    bindInput() {
      document.addEventListener("keydown", (event) => {
        if (isSpaceKey(event)) {
          emitInteractionFact({
            kind: "temporary-native-map-access-started",
          });
          return;
        }
        if (!isPinToggleKey(event)) {
          return;
        }
        emitInteractionFact({
          kind: "registration-pin-toggle-requested",
        });
      });
      document.addEventListener("keyup", (event) => {
        if (!isSpaceKey(event)) {
          return;
        }
        emitInteractionFact({
          kind: "temporary-native-map-access-ended",
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
