import {
  createOverlayInputHost,
} from "./overlay-input-host.js";
import {
  domEventPayload,
} from "./event-debug-log.js";

const DRAG_THRESHOLD_PX = 8;

export function createOverlayAdapter({
  document,
  emitInteractionFact = () => {},
  eventDebugLogger = null,
}) {
  let activeSequence = null;
  let inputHost = null;
  let boundSurface = null;
  let renderedOverlay = null;

  const globalPointerHandlers = {
    handleGlobalPointerMove(event) {
      handlePointerMove(event);
    },
    handleGlobalPointerUp(event) {
      handlePointerUp(event);
    },
  };

  return {
    render(overlay, overlayInput = {
      kind: "overlay-editing",
    }) {
      renderedOverlay = overlay;
      const root = document.createElement("div");
      root.className = "id-overlay-viewport";
      root.dataset.region = "overlay";
      root.dataset.idOverlayOwned = "true";
      if (!overlay.visible) {
        root.hidden = true;
        return root;
      }
      const viewport = overlay.viewport;
      if (viewport) {
        root.dataset.mode = viewport.mode;
        root.dataset.passThrough = String(viewport.isPassThrough);
        root.style.left = `${viewport.rect.left}px`;
        root.style.top = `${viewport.rect.top}px`;
        root.style.width = `${viewport.rect.width}px`;
        root.style.height = `${viewport.rect.height}px`;
      }
      const mapLayer = document.createElement("div");
      mapLayer.className = "id-overlay-map-layer";
      mapLayer.style.position = "absolute";
      mapLayer.style.left = "0";
      mapLayer.style.top = "0";
      mapLayer.style.right = "0";
      mapLayer.style.bottom = "0";
      mapLayer.style.pointerEvents = "none";
      mapLayer.style.transform = overlay.mapLayer?.transformCss ?? overlay.pageSurfaceMotion?.transformCss ?? "";
      mapLayer.style.transformOrigin = overlay.mapLayer?.transformOriginCss ?? overlay.pageSurfaceMotion?.transformOriginCss ?? "";

      const image = document.createElement(overlay.image ? "img" : "div");
      image.className = "id-overlay-image";
      image.dataset.overlayImage = "";
      image.dataset.imageDataRef = overlay.imageDataRef;
      image.alt = "";
      image.decoding = "async";
      applyImagePresentation(image, overlay);
      image.style.position = "absolute";
      image.style.pointerEvents = overlayInput.kind === "native-map" ? "none" : "auto";
      image.style.touchAction = "none";
      image.style.userSelect = "none";
      image.style.backgroundRepeat = "no-repeat";
      image.style.backgroundSize = "100% 100%";
      if (overlay.displayImageUrl) {
        image.style.backgroundImage = `url("${overlay.displayImageUrl}")`;
      }
      mapLayer.append(image);

      const frame = document.createElement("div");
      frame.className = "id-overlay-frame";
      applyFrameChrome(frame);
      if (overlay.frame) {
        applyPlacementBox(frame, overlay.frame);
        frame.style.display = "block";
        frame.style.pointerEvents = overlay.frame.ownsPointerHitTesting ? "auto" : "none";
      } else {
        applyInlineFramePresentation(frame, overlay);
        frame.style.display = overlay.visible ? "block" : "none";
        frame.style.pointerEvents = overlayInput.kind === "native-map" ? "none" : "auto";
      }
      mapLayer.append(frame);

      const mapPinLayer = document.createElement("div");
      mapPinLayer.className = "id-overlay-map-pin-layer";
      applyPinLayerChrome(mapPinLayer);
      for (const pin of overlay.mapPins ?? []) {
        mapPinLayer.append(renderMapPin(document, pin));
      }
      mapLayer.append(mapPinLayer);

      const pinLayer = document.createElement("div");
      pinLayer.className = "id-overlay-pin-layer";
      applyPinLayerChrome(pinLayer);
      applyOverlayPinLayerPresentation(pinLayer, overlay);
      for (const pin of overlay.pins ?? []) {
        pinLayer.append(renderOverlayPin(document, pin));
      }
      mapLayer.append(pinLayer);
      root.append(mapLayer);

      return root;
    },
    bindInput(surface) {
      boundSurface = surface;
      eventDebugLogger?.log("overlay", "bind-input", {
        target: "overlay-surface",
      });
      inputHost = createOverlayInputHost({
        getMountElement: () => boundSurface,
        globalPointerHandlers,
        fallbackWindow: document.defaultView,
      });
      surface.addEventListener("click", stopOwnedSequence);
      surface.addEventListener("dblclick", handleDoubleClick);
      surface.addEventListener("pointerdown", handlePointerDown);
      surface.addEventListener("wheel", handleWheel);
    },
    destroy() {
      eventDebugLogger?.log("overlay", "destroy", {
        activeSequence: Boolean(activeSequence),
      });
      inputHost?.destroy();
      inputHost = null;
      activeSequence = null;
    },
  };

  function handleDoubleClick(event) {
    eventDebugLogger?.log("overlay.handler", "dblclick", domEventPayload(event));
    event.preventDefault();
    event.stopPropagation();
    emitInteractionFact({
      kind: "registration-pin-toggle-requested",
      screenPx: screenPxFromEvent(event),
    });
  }

  function handlePointerDown(event) {
    eventDebugLogger?.log("overlay.handler", "pointerdown", domEventPayload(event));
    if (event.__idOverlayForwardedNativeMap) {
      return;
    }
    if (event.button !== 0) {
      eventDebugLogger?.log("overlay.sequence", "pointerdown-ignored", {
        reason: "non-primary-button",
        button: event.button,
      });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    activeSequence = {
      anchorScreenPx: screenPxFromEvent(event),
      basePlacement: placementFromOverlay(renderedOverlay),
      mode: event.shiftKey ? "move" : "native-pan",
      started: false,
    };
    eventDebugLogger?.log("overlay.sequence", "start", {
      mode: activeSequence.mode,
      anchorScreenPx: activeSequence.anchorScreenPx,
    });
    inputHost?.syncGlobalPointerListeners(true);
  }

  function handlePointerMove(event) {
    eventDebugLogger?.log("overlay.handler", "pointermove", domEventPayload(event));
    if (event.__idOverlayForwardedNativeMap) {
      return;
    }
    if (!activeSequence) {
      eventDebugLogger?.log("overlay.sequence", "move-ignored", {
        reason: "no-active-sequence",
      });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const screenPx = screenPxFromEvent(event);
    if (activeSequence.mode === "native-pan") {
      if (!activeSequence.started) {
        activeSequence.started = true;
        emitInteractionFact({
          kind: "native-map-gesture-requested",
          gestureKind: "pan",
          phase: "start",
          screenPx: activeSequence.anchorScreenPx,
        });
        eventDebugLogger?.log("overlay.sequence", "native-pan-start", {
          screenPx: activeSequence.anchorScreenPx,
        });
      }
      emitInteractionFact({
        kind: "native-map-gesture-requested",
        gestureKind: "pan",
        phase: "move",
        screenPx,
      });
      eventDebugLogger?.log("overlay.sequence", "native-pan-move", {
        screenPx,
      });
      return;
    }

    const screenDeltaPx = subtractScreenPx(screenPx, activeSequence.anchorScreenPx);
    if (!activeSequence.started && vectorLength(screenDeltaPx) < DRAG_THRESHOLD_PX) {
      eventDebugLogger?.log("overlay.sequence", "move-pending", {
        screenDeltaPx,
        distancePx: vectorLength(screenDeltaPx),
        thresholdPx: DRAG_THRESHOLD_PX,
      });
      return;
    }
    activeSequence.started = true;
    applyMovePreview(screenDeltaPx);
    eventDebugLogger?.log("overlay.sequence", "move-preview", {
      screenDeltaPx,
      anchorScreenPx: activeSequence.anchorScreenPx,
    });
  }

  function handlePointerUp(event) {
    eventDebugLogger?.log("overlay.handler", event.type, domEventPayload(event));
    if (event.__idOverlayForwardedNativeMap) {
      return;
    }
    if (!activeSequence) {
      eventDebugLogger?.log("overlay.sequence", "end-ignored", {
        reason: "no-active-sequence",
      });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (activeSequence.mode === "native-pan" && activeSequence.started) {
      emitInteractionFact({
        kind: "native-map-gesture-requested",
        gestureKind: "pan",
        phase: "end",
        screenPx: screenPxFromEvent(event),
      });
      eventDebugLogger?.log("overlay.sequence", "native-pan-end", {
        screenPx: screenPxFromEvent(event),
      });
    } else if (activeSequence.mode === "move" && event.type !== "pointercancel") {
      const screenDeltaPx = subtractScreenPx(
        screenPxFromEvent(event),
        activeSequence.anchorScreenPx,
      );
      if (activeSequence.started || vectorLength(screenDeltaPx) >= DRAG_THRESHOLD_PX) {
        emitInteractionFact({
          kind: "placement-edit-requested",
          editKind: "move",
          screenDeltaPx,
          anchorScreenPx: activeSequence.anchorScreenPx,
        });
        eventDebugLogger?.log("overlay.sequence", "move-commit", {
          screenDeltaPx,
          anchorScreenPx: activeSequence.anchorScreenPx,
        });
      }
    }
    eventDebugLogger?.log("overlay.sequence", "end", {
      mode: activeSequence.mode,
      started: activeSequence.started,
    });
    activeSequence = null;
    inputHost?.syncGlobalPointerListeners(false);
  }

  function handleWheel(event) {
    eventDebugLogger?.log("overlay.handler", "wheel", domEventPayload(event));
    if (activeSequence) {
      event.preventDefault();
      event.stopPropagation();
      eventDebugLogger?.log("overlay.sequence", "wheel-ignored", {
        reason: "active-pointer-sequence",
        mode: activeSequence.mode,
      });
      return;
    }
    const fact = wheelFact(event);
    if (!fact) {
      eventDebugLogger?.log("overlay.sequence", "wheel-ignored", {
        reason: "no-fact",
      });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    emitInteractionFact(fact);
    eventDebugLogger?.log("overlay.sequence", "wheel-commit", {
      factKind: fact.kind,
      gestureKind: fact.gestureKind,
      editKind: fact.editKind,
    });
  }

  function applyMovePreview(screenDeltaPx) {
    const previewPlacement = {
      ...activeSequence.basePlacement,
      x: activeSequence.basePlacement.x + screenDeltaPx.x,
      y: activeSequence.basePlacement.y + screenDeltaPx.y,
    };
    const image = boundSurface?.querySelector(".id-overlay-image");
    const frame = boundSurface?.querySelector(".id-overlay-frame");
    const pinLayer = boundSurface?.querySelector(".id-overlay-pin-layer");
    if (image && !renderedOverlay?.image) {
      image.style.transform = serializePlacement(previewPlacement);
    }
    if (frame && !renderedOverlay?.frame) {
      frame.style.transform = serializePlacement(previewPlacement);
    }
    if (pinLayer && !renderedOverlay?.image) {
      pinLayer.style.transform = serializePlacement(previewPlacement);
    }
  }
}

function placementFromOverlay(overlay) {
  return overlay?.placement ?? {
    x: 0,
    y: 0,
    scale: 1,
    rotationRad: 0,
  };
}

function stopOwnedSequence(event) {
  event.preventDefault();
  event.stopPropagation();
}

function wheelFact(event) {
  const inputDelta = {
    y: event.deltaY,
  };
  const anchorScreenPx = screenPxFromEvent(event);
  if (event.altKey) {
    return {
      kind: "opacity-adjustment-requested",
      inputDelta,
      anchorScreenPx,
    };
  }
  if (event.ctrlKey) {
    return {
      kind: "placement-edit-requested",
      editKind: "rotate",
      inputDelta,
      anchorScreenPx,
    };
  }
  if (event.shiftKey) {
    return {
      kind: "placement-edit-requested",
      editKind: "scale",
      inputDelta,
      anchorScreenPx,
    };
  }
  return {
    kind: "native-map-gesture-requested",
    gestureKind: "zoom",
    inputDelta,
    anchorScreenPx,
  };
}

function serializePlacement(placement) {
  const effectivePlacement = placement ?? {
    x: 0,
    y: 0,
    scale: 1,
    rotationRad: 0,
  };
  return `translate(${effectivePlacement.x}px, ${effectivePlacement.y}px) rotate(${effectivePlacement.rotationRad}rad) scale(${effectivePlacement.scale})`;
}

function applyImagePresentation(image, overlay) {
  if (overlay.image) {
    image.style.display = "block";
    if (overlay.image.src) {
      image.src = overlay.image.src;
    }
    applyPlacementBox(image, overlay.image);
    image.style.opacity = String(overlay.image.opacity);
    return;
  }

  image.style.width = `${overlay.intrinsicSizePx.width}px`;
  image.style.height = `${overlay.intrinsicSizePx.height}px`;
  image.style.opacity = String(overlay.opacity);
  image.style.transform = serializePlacement(overlay.placement);
  image.style.transformOrigin = "0 0";
}

function applyFrameChrome(frame) {
  frame.style.position = "absolute";
  frame.style.border = "1px solid rgba(15, 23, 42, 0.42)";
  frame.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.36)";
  frame.style.boxSizing = "border-box";
  frame.style.userSelect = "none";
}

function applyInlineFramePresentation(frame, overlay) {
  frame.style.width = `${overlay.intrinsicSizePx.width}px`;
  frame.style.height = `${overlay.intrinsicSizePx.height}px`;
  frame.style.transform = serializePlacement(overlay.placement);
  frame.style.transformOrigin = "0 0";
}

function applyPinLayerChrome(pinLayer) {
  pinLayer.style.position = "absolute";
  pinLayer.style.left = "0";
  pinLayer.style.top = "0";
  pinLayer.style.right = "0";
  pinLayer.style.bottom = "0";
  pinLayer.style.pointerEvents = "none";
}

function applyOverlayPinLayerPresentation(pinLayer, overlay) {
  if (overlay.image) {
    applyPlacementBox(pinLayer, overlay.image);
    return;
  }
  pinLayer.style.width = `${overlay.intrinsicSizePx.width}px`;
  pinLayer.style.height = `${overlay.intrinsicSizePx.height}px`;
  pinLayer.style.transform = serializePlacement(overlay.placement);
  pinLayer.style.transformOrigin = "0 0";
}

function applyPlacementBox(element, box) {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
  element.style.transformOrigin = "0 0";
  element.style.transform = `rotate(${box.rotationDeg}deg)`;
}

function renderOverlayPin(document, pin) {
  const pinElement = document.createElement("div");
  pinElement.className = "id-overlay-pin";
  pinElement.dataset.registrationPin = "";
  pinElement.dataset.pinId = String(pin.id);
  const left = pin.left ?? pin.imagePx?.x ?? 0;
  const top = pin.top ?? pin.imagePx?.y ?? 0;
  applyPinMarkerChrome(pinElement);
  pinElement.style.left = `${left}px`;
  pinElement.style.top = `${top}px`;
  pinElement.textContent = String(pin.id);
  return pinElement;
}

function renderMapPin(document, pin) {
  const pinElement = document.createElement("div");
  pinElement.className = "id-overlay-map-pin";
  pinElement.dataset.pinId = String(pin.id);
  applyPinMarkerChrome(pinElement);
  pinElement.style.left = `${pin.left}px`;
  pinElement.style.top = `${pin.top}px`;
  pinElement.textContent = String(pin.id);
  return pinElement;
}

function applyPinMarkerChrome(pinElement) {
  pinElement.style.position = "absolute";
  pinElement.style.width = "14px";
  pinElement.style.height = "14px";
  pinElement.style.marginLeft = "-7px";
  pinElement.style.marginTop = "-7px";
  pinElement.style.border = "2px solid white";
  pinElement.style.borderRadius = "999px";
  pinElement.style.boxSizing = "border-box";
  pinElement.style.background = "rgba(37, 99, 235, 0.92)";
  pinElement.style.color = "white";
  pinElement.style.font = "10px / 10px sans-serif";
  pinElement.style.textAlign = "center";
  pinElement.style.userSelect = "none";
}

function screenPxFromEvent(event) {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function subtractScreenPx(toScreenPx, fromScreenPx) {
  return {
    x: toScreenPx.x - fromScreenPx.x,
    y: toScreenPx.y - fromScreenPx.y,
  };
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}
