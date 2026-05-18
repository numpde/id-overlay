import {
  createOverlayInputHost,
} from "./overlay-input-host.js";
import {
  domEventPayload,
} from "./event-debug-log.js";
import {
  overlayDomDebugSummary,
} from "./extension-ui-overlay-debug.js";
import {
  OVERLAY_DOM_CLASS,
  OVERLAY_DOM_SELECTOR,
} from "./overlay-dom.js";
import {
  REGISTRATION_MAP_PIN_MARKER_PRESENTATION,
  REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION,
  registrationPinMarkerTonePresentation,
} from "./registration-pin-marker.js";
import {
  UI_COLOR_TOKEN,
} from "./ui-color-tokens.js";

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
  let renderedRoot = null;
  let renderedVisualMode = "align";

  const globalPointerHandlers = {
    handleGlobalPointerMove(event) {
      handlePointerMove(event);
    },
    handleGlobalPointerUp(event) {
      handlePointerUp(event);
    },
  };

  return {
    render(overlay, overlayInput, visualChrome = {}) {
      overlayInput = requireOverlayInput(overlayInput);
      renderedVisualMode = visualModeFromChrome(visualChrome, overlayInput);
      renderedOverlay = overlay;
      const root = document.createElement("div");
      renderedRoot = root;
      root.className = OVERLAY_DOM_CLASS.viewport;
      root.dataset.region = "overlay";
      root.dataset.idOverlayOwned = "true";
      if (!overlay.visible) {
        applyViewportChrome(root);
        root.hidden = true;
        return root;
      }
      patchViewport(root, overlay.viewport);
      const mapLayer = document.createElement("div");
      mapLayer.className = OVERLAY_DOM_CLASS.mapLayer;
      applyMapLayerChrome(mapLayer);
      patchMapLayer(mapLayer, overlay);

      const image = document.createElement(overlay.image ? "img" : "div");
      image.className = OVERLAY_DOM_CLASS.image;
      image.dataset.overlayImage = "";
      image.alt = "";
      image.decoding = "async";
      applyImageChrome(image);
      patchImage(image, overlay, overlayInput);
      mapLayer.append(image);

      const frame = document.createElement("div");
      frame.className = OVERLAY_DOM_CLASS.frame;
      applyFrameChrome(frame);
      patchFrame(frame, overlay, overlayInput, renderedVisualMode);
      mapLayer.append(frame);

      const mapPinLayer = document.createElement("div");
      mapPinLayer.className = OVERLAY_DOM_CLASS.mapPinLayer;
      applyPinLayerChrome(mapPinLayer);
      for (const pin of overlay.mapPins ?? []) {
        mapPinLayer.append(renderMapPin(document, pin, {
          visualScale: mapPinMarkerScaleForInlinePlacement(overlay),
        }));
      }
      mapLayer.append(mapPinLayer);

      const pinLayer = document.createElement("div");
      pinLayer.className = OVERLAY_DOM_CLASS.pinLayer;
      applyPinLayerChrome(pinLayer);
      applyOverlayPinLayerPresentation(pinLayer, overlay);
      for (const pin of overlay.pins ?? []) {
        pinLayer.append(renderOverlayPin(document, pin));
      }
      mapLayer.append(pinLayer);
      root.append(mapLayer);

      return root;
    },
    update(overlay, overlayInput, visualChrome = {}) {
      overlayInput = requireOverlayInput(overlayInput);
      const visualMode = visualModeFromChrome(visualChrome, overlayInput);
      if (!patchRenderedOverlay({
        root: renderedRoot,
        overlay,
        overlayInput,
        visualMode,
      })) {
        return false;
      }
      renderedOverlay = overlay;
      renderedVisualMode = visualMode;
      eventDebugLogger?.log("overlay.dom", "projection-patched", overlayDomDebugSummary({
        overlayRoot: renderedRoot,
        overlay,
        overlayInput,
      }));
      return true;
    },
    previewOpacity(opacity) {
      const image = renderedRoot?.querySelector(OVERLAY_DOM_SELECTOR.image);
      if (!image) {
        return;
      }
      image.style.opacity = String(opacity);
    },
    bindInput(surface) {
      unbindSurfaceInput();
      inputHost?.destroy();
      inputHost = null;
      activeSequence = null;
      boundSurface = surface;
      eventDebugLogger?.log("overlay", "bind-input", {
        target: "overlay-surface",
      });
      inputHost = createOverlayInputHost({
        getMountElement: () => boundSurface,
        globalPointerHandlers,
        fallbackWindow: document.defaultView,
      });
      bindSurfaceInput(surface);
    },
    destroy() {
      eventDebugLogger?.log("overlay", "destroy", {
        activeSequence: Boolean(activeSequence),
      });
      unbindSurfaceInput();
      inputHost?.destroy();
      inputHost = null;
      activeSequence = null;
      renderedRoot = null;
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

  function bindSurfaceInput(surface) {
    surface.addEventListener("click", stopOwnedSequence);
    surface.addEventListener("dblclick", handleDoubleClick);
    surface.addEventListener("pointerdown", handlePointerDown);
    surface.addEventListener("wheel", handleWheel);
  }

  function unbindSurfaceInput() {
    if (!boundSurface) {
      return;
    }
    boundSurface.removeEventListener("click", stopOwnedSequence);
    boundSurface.removeEventListener("dblclick", handleDoubleClick);
    boundSurface.removeEventListener("pointerdown", handlePointerDown);
    boundSurface.removeEventListener("wheel", handleWheel);
    boundSurface = null;
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
    const image = boundSurface?.querySelector(OVERLAY_DOM_SELECTOR.image);
    const frame = boundSurface?.querySelector(OVERLAY_DOM_SELECTOR.frame);
    const pinLayer = boundSurface?.querySelector(OVERLAY_DOM_SELECTOR.pinLayer);
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

export function overlayStructuralRenderSignature({
  overlay,
  overlayInput,
}) {
  return JSON.stringify({
    overlay: overlayStructuralShape(overlay),
    overlayInput,
  });
}

function overlayStructuralShape(overlay) {
  if (!overlay || typeof overlay !== "object") {
    return overlay;
  }
  if (!overlay.visible) {
    return {
      visible: false,
    };
  }
  return {
    visible: true,
    imageDataRef: overlay.imageDataRef,
    intrinsicSizePx: overlay.intrinsicSizePx,
    imageElementKind: overlay.image ? "img" : "box",
    hasFrameBox: Boolean(overlay.frame),
    pinIds: (overlay.pins ?? []).map((pin) => pin.id),
    mapPinIds: (overlay.mapPins ?? []).map((pin) => pin.id),
  };
}

function patchRenderedOverlay({
  root,
  overlay,
  overlayInput,
  visualMode,
}) {
  if (!root) {
    return false;
  }
  if (!overlay?.visible) {
    root.hidden = true;
    return true;
  }

  const mapLayer = root.querySelector(OVERLAY_DOM_SELECTOR.mapLayer);
  const image = root.querySelector(OVERLAY_DOM_SELECTOR.image);
  const frame = root.querySelector(OVERLAY_DOM_SELECTOR.frame);
  const mapPinLayer = root.querySelector(OVERLAY_DOM_SELECTOR.mapPinLayer);
  const pinLayer = root.querySelector(OVERLAY_DOM_SELECTOR.pinLayer);
  if (!mapLayer || !image || !frame || !mapPinLayer || !pinLayer) {
    return false;
  }
  if (overlay.image && image.tagName !== "IMG") {
    return false;
  }
  if (!overlay.image && image.tagName !== "DIV") {
    return false;
  }

  patchViewport(root, overlay.viewport);
  patchMapLayer(mapLayer, overlay);
  patchImage(image, overlay, overlayInput);
  patchFrame(frame, overlay, overlayInput, visualMode);
  const mapPinsPatched = patchMapPinLayer({
    pinLayer: mapPinLayer,
    pins: overlay.mapPins ?? [],
    visualScale: mapPinMarkerScaleForInlinePlacement(overlay),
  });
  const overlayPinsPatched = patchOverlayPinLayer({
    pinLayer,
    pins: overlay.pins ?? [],
  });
  if (!mapPinsPatched || !overlayPinsPatched) {
    return false;
  }
  applyOverlayPinLayerPresentation(pinLayer, overlay);
  return true;
}

function patchViewport(root, viewport) {
  applyViewportChrome(root);
  root.hidden = false;
  if (!viewport) {
    delete root.dataset.mode;
    delete root.dataset.passThrough;
    root.style.left = "";
    root.style.top = "";
    root.style.width = "";
    root.style.height = "";
    return;
  }
  root.dataset.mode = viewport.mode;
  root.dataset.passThrough = String(viewport.isPassThrough);
  root.style.left = `${viewport.rect.left}px`;
  root.style.top = `${viewport.rect.top}px`;
  root.style.width = `${viewport.rect.width}px`;
  root.style.height = `${viewport.rect.height}px`;
}

function applyViewportChrome(root) {
  root.style.position = "fixed";
  root.style.overflow = "hidden";
  root.style.pointerEvents = "none";
}

function applyMapLayerChrome(mapLayer) {
  mapLayer.style.position = "absolute";
  mapLayer.style.left = "0";
  mapLayer.style.top = "0";
  mapLayer.style.right = "0";
  mapLayer.style.bottom = "0";
  mapLayer.style.pointerEvents = "none";
}

function patchMapLayer(mapLayer, overlay) {
  const surfaceMotion = overlay?.mapLayer ?? overlay?.pageSurfaceMotion ?? null;
  mapLayer.style.transform = surfaceMotion?.transformCss ?? "";
  mapLayer.style.transformOrigin = surfaceMotion?.transformOriginCss ?? "";
}

function applyImageChrome(image) {
  image.style.position = "absolute";
  image.style.touchAction = "none";
  image.style.userSelect = "none";
  image.style.backgroundRepeat = "no-repeat";
  image.style.backgroundSize = "100% 100%";
}

function patchImage(image, overlay, overlayInput) {
  image.dataset.imageDataRef = overlay.imageDataRef;
  image.style.pointerEvents = overlayInput.kind === "native-map" ? "none" : "auto";
  if (overlay.displayImageUrl) {
    image.style.backgroundImage = cssUrl(overlay.displayImageUrl);
  } else {
    image.style.backgroundImage = "";
  }
  applyImagePresentation(image, overlay);
}

function patchFrame(frame, overlay, overlayInput, visualMode) {
  frame.style.borderColor = frameBorderColor(visualMode);
  if (overlay.frame) {
    applyPlacementBox(frame, overlay.frame);
    frame.style.display = "block";
    frame.style.pointerEvents = overlay.frame.ownsPointerHitTesting ? "auto" : "none";
    return;
  }
  applyInlineFramePresentation(frame, overlay);
  frame.style.display = overlay.visible ? "block" : "none";
  frame.style.pointerEvents = overlayInput.kind === "native-map" ? "none" : "auto";
}

function patchMapPinLayer({
  pinLayer,
  pins,
  visualScale,
}) {
  return patchRegistrationPinLayer({
    pinLayer,
    pins,
    selector: OVERLAY_DOM_SELECTOR.mapPinAnchor,
    markerFromElement: (element) => element.querySelector(OVERLAY_DOM_SELECTOR.mapPinMarker),
    positionElement: (element, pin) => applyPinPosition(element, mapPinPoint(pin)),
    markerOptions: () => ({
      presentation: REGISTRATION_MAP_PIN_MARKER_PRESENTATION,
      visualScale,
    }),
  });
}

function patchOverlayPinLayer({
  pinLayer,
  pins,
}) {
  return patchRegistrationPinLayer({
    pinLayer,
    pins,
    selector: OVERLAY_DOM_SELECTOR.overlayPin,
    markerFromElement: (element) => element,
    positionElement: (element, pin) => applyPinPosition(element, overlayPinPoint(pin)),
    markerOptions: () => ({
      presentation: REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION,
    }),
  });
}

function patchRegistrationPinLayer({
  pinLayer,
  pins,
  selector,
  markerFromElement,
  positionElement,
  markerOptions,
}) {
  const elements = [...pinLayer.querySelectorAll(selector)];
  if (elements.length !== pins.length) {
    return false;
  }
  for (let index = 0; index < pins.length; index += 1) {
    const pin = pins[index];
    const element = elements[index];
    if (element.dataset.pinId !== String(pin.id)) {
      return false;
    }
    const marker = markerFromElement(element);
    if (!marker) {
      return false;
    }
    positionElement(element, pin);
    applyRegistrationPinMarker(marker, pin, markerOptions(pin));
  }
  return true;
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

  applyInlinePlacementBox(image, overlay);
  image.style.opacity = String(overlay.opacity);
}

function applyFrameChrome(frame) {
  frame.style.position = "absolute";
  frame.style.borderWidth = "1px";
  frame.style.borderStyle = "solid";
  frame.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.36)";
  frame.style.boxSizing = "border-box";
  frame.style.userSelect = "none";
}

function visualModeFromChrome(visualChrome, overlayInput) {
  if (visualChrome?.mode === "trace" || visualChrome?.mode === "align") {
    return visualChrome.mode;
  }
  return overlayInput.kind === "native-map" ? "trace" : "align";
}

function frameBorderColor(visualMode) {
  return visualMode === "trace" ? UI_COLOR_TOKEN.trace : UI_COLOR_TOKEN.align;
}

function applyInlineFramePresentation(frame, overlay) {
  applyInlinePlacementBox(frame, overlay);
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
  applyInlinePlacementBox(pinLayer, overlay);
}

function applyInlinePlacementBox(element, overlay) {
  element.style.width = `${overlay.intrinsicSizePx.width}px`;
  element.style.height = `${overlay.intrinsicSizePx.height}px`;
  element.style.transform = serializePlacement(overlay.placement);
  element.style.transformOrigin = "0 0";
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
  const pinElement = createRegistrationPinMarker(document, {
    className: OVERLAY_DOM_CLASS.overlayPin,
    pin,
    options: {
      presentation: REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION,
    },
  });
  pinElement.dataset.registrationPin = "";
  applyPinPosition(pinElement, overlayPinPoint(pin));
  return pinElement;
}

function renderMapPin(document, pin, {
  visualScale = 1,
} = {}) {
  const anchor = document.createElement("div");
  anchor.className = OVERLAY_DOM_CLASS.mapPinAnchor;
  anchor.dataset.pinId = String(pin.id);
  applyMapPinAnchorChrome(anchor);
  applyPinPosition(anchor, mapPinPoint(pin));

  anchor.append(createRegistrationPinMarker(document, {
    className: OVERLAY_DOM_CLASS.mapPinMarker,
    pin,
    options: {
      presentation: REGISTRATION_MAP_PIN_MARKER_PRESENTATION,
      visualScale,
    },
  }));
  return anchor;
}

function createRegistrationPinMarker(document, {
  className,
  pin,
  options,
}) {
  const marker = document.createElement("div");
  marker.className = className;
  marker.dataset.pinId = String(pin.id);
  applyRegistrationPinMarker(marker, pin, options);
  return marker;
}

function applyRegistrationPinMarker(marker, pin, options) {
  marker.textContent = pinMarkerLabel(pin);
  applyPinMarkerChrome(marker, pin.tone, options);
}

function overlayPinPoint(pin) {
  return {
    left: pin.left ?? pin.imagePx?.x ?? 0,
    top: pin.top ?? pin.imagePx?.y ?? 0,
  };
}

function mapPinPoint(pin) {
  return {
    left: pin.left,
    top: pin.top,
  };
}

function applyPinPosition(element, {
  left,
  top,
}) {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

function pinMarkerLabel(pin) {
  return pin.label === undefined ? String(pin.id) : String(pin.label);
}

function applyPinMarkerChrome(pinElement, tone = "normal", {
  presentation = REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION,
  visualScale = 1,
} = {}) {
  const {
    sizePx,
    borderPx,
    fontPx,
    opacity,
  } = presentation;
  const tonePresentation = registrationPinMarkerTonePresentation(tone);
  pinElement.dataset.pinTone = tonePresentation.tone;
  pinElement.style.position = "absolute";
  pinElement.style.width = `${sizePx}px`;
  pinElement.style.height = `${sizePx}px`;
  pinElement.style.marginLeft = `${-sizePx / 2}px`;
  pinElement.style.marginTop = `${-sizePx / 2}px`;
  pinElement.style.border = `${borderPx}px solid white`;
  pinElement.style.borderRadius = "999px";
  pinElement.style.boxSizing = "border-box";
  pinElement.style.background = tonePresentation.background;
  pinElement.style.color = "white";
  pinElement.style.fontSize = `${fontPx}px`;
  pinElement.style.lineHeight = `${fontPx}px`;
  pinElement.style.fontFamily = "sans-serif";
  pinElement.style.textAlign = "center";
  pinElement.style.userSelect = "none";
  pinElement.style.opacity = String(opacity);
  pinElement.style.transform = visualScale === 1 ? "" : `scale(${visualScale})`;
  pinElement.style.transformOrigin = "50% 50%";
}

function requireOverlayInput(overlayInput) {
  if (!overlayInput || typeof overlayInput !== "object") {
    throw new TypeError("overlayInput is required");
  }
  if (typeof overlayInput.kind !== "string") {
    throw new TypeError("overlayInput.kind is required");
  }
  return overlayInput;
}

function applyMapPinAnchorChrome(anchor) {
  anchor.style.position = "absolute";
  anchor.style.left = "0";
  anchor.style.top = "0";
  anchor.style.width = "0";
  anchor.style.height = "0";
}

function mapPinMarkerScaleForInlinePlacement(overlay) {
  if (overlay?.image) {
    return 1;
  }
  const scale = placementFromOverlay(overlay).scale;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function cssUrl(value) {
  return `url("${cssString(value)}")`;
}

function cssString(value) {
  return String(value)
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, "\\\"")
    .replace(/\n/gu, "\\A ")
    .replace(/\r/gu, "\\D ")
    .replace(/\f/gu, "\\C ");
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
