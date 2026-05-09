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
      surface.addEventListener("wheel", (event) => {
        const kind = getWheelFactKind(event);
        if (!kind) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        emitInteractionFact({
          kind,
          deltaY: event.deltaY,
          screenPx: {
            x: event.clientX,
            y: event.clientY,
          },
        });
      });
    },
  };
}

function getWheelFactKind(event) {
  if (event.altKey) {
    return "overlay-opacity-wheel";
  }
  if (event.ctrlKey) {
    return "overlay-rotate-wheel";
  }
  if (event.shiftKey) {
    return "overlay-scale-wheel";
  }
  return null;
}
