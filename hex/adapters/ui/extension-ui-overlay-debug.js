export function overlayDomDebugSummary({
  overlayRoot,
  overlay,
  overlayInput,
}) {
  const image = overlayRoot.querySelector(".id-overlay-image");
  const frame = overlayRoot.querySelector(".id-overlay-frame");
  const mapLayer = overlayRoot.querySelector(".id-overlay-map-layer");
  return {
    overlayInputKind: overlayInput?.kind,
    visible: overlay?.visible,
    viewport: overlay?.viewport,
    placement: overlay?.placement,
    pageSurfaceMotion: overlay?.pageSurfaceMotion,
    mapLayer: overlay?.mapLayer,
    root: elementStyleDebugSummary(overlayRoot),
    domMapLayer: elementStyleDebugSummary(mapLayer),
    domImage: elementStyleDebugSummary(image),
    domFrame: elementStyleDebugSummary(frame),
  };
}

function elementStyleDebugSummary(element) {
  if (!element) {
    return null;
  }
  return {
    hidden: Boolean(element.hidden),
    dataset: {
      mode: element.dataset?.mode,
      passThrough: element.dataset?.passThrough,
    },
    style: {
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      height: element.style.height,
      transform: element.style.transform,
      transformOrigin: element.style.transformOrigin,
      display: element.style.display,
      pointerEvents: element.style.pointerEvents,
    },
    rect: rectDebugSummary(element.getBoundingClientRect?.()),
  };
}

function rectDebugSummary(rect) {
  if (!rect) {
    return null;
  }
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
