export function createOverlayAdapter({ emitInteractionFact }) {
  return {
    bindInput(surface) {
      surface.addEventListener("pointerdown", (event) => {
        emitInteractionFact({
          kind: "overlay-pointer-down",
          screenPx: {
            x: event.clientX,
            y: event.clientY,
          },
          button: event.button,
        });
      });
    },
  };
}
