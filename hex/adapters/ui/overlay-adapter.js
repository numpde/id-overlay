export function createOverlayAdapter({
  document,
  emitInteractionFact = () => {},
}) {
  return {
    render(overlayView) {
      const root = document.createElement("div");
      root.dataset.control = "overlay";
      if (!overlayView.visible) {
        return root;
      }

      const image = document.createElement("div");
      image.dataset.overlayImage = "";
      image.dataset.imageDataRef = overlayView.imageDataRef;
      image.style.backgroundImage = `url("${escapeCssString(overlayView.imageDataRef)}")`;
      image.style.backgroundSize = "100% 100%";
      image.style.width = `${overlayView.intrinsicSizePx.width}px`;
      image.style.height = `${overlayView.intrinsicSizePx.height}px`;
      image.style.opacity = String(overlayView.opacity ?? 1);
      if (overlayView.placement) {
        image.style.transformOrigin = "0 0";
        image.style.transform = placementTransform(overlayView.placement);
      }
      root.append(image);

      for (const pin of overlayView.pins ?? []) {
        const pinElement = document.createElement("button");
        pinElement.dataset.registrationPin = "";
        pinElement.dataset.pinId = String(pin.id);
        root.append(pinElement);
      }

      return root;
    },

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

function escapeCssString(value) {
  return String(value).replace(/["\\\n\r\f]/g, (character) => {
    if (character === "\n") {
      return "\\a ";
    }
    if (character === "\r") {
      return "\\d ";
    }
    if (character === "\f") {
      return "\\c ";
    }
    return `\\${character}`;
  });
}

function placementTransform(placement) {
  return [
    `translate(${placement.x}px, ${placement.y}px)`,
    `rotate(${placement.rotationRad}rad)`,
    `scale(${placement.scale})`,
  ].join(" ");
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
