import {
  buildOverlayRenderModel,
  buildPinRenderModels,
  imagePointToScreenPoint,
  resolveOverlayScreenTransform,
} from "../../core/transform.js";
import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import { selectOverlayPresentation } from "../../core/machine/selectors.js";

export function buildOverlayViewModel({
  machineState,
  runtime,
  snapshot,
  projectMapPinScreenPoint = null,
}) {
  const session = machineState.session;
  const viewportRect = snapshot.viewportRect;
  const localViewportRect = snapshot.localViewportRect ?? viewportRect;
  const presentation = selectOverlayPresentation(machineState, runtime);
  const base = {
    viewport: {
      mode: presentation.mode,
      isPassThrough: presentation.isPassThrough,
      rect: localViewportRect,
    },
    mapLayer: {
      transformOriginCss: snapshot.surfaceMotion.transformOriginCss,
      transformCss: snapshot.surfaceMotion.transformCss,
    },
    image: null,
    frame: null,
    pins: {
      overlay: [],
      map: [],
    },
  };

  if (!hasOverlayImageSession(session)) {
    return base;
  }

  const transform = resolveOverlayScreenTransform({
    state: machineState,
    snapshot,
  });
  if (!transform) {
    return base;
  }

  const image = getOverlayImage(session);
  const imageRenderModel = buildOverlayRenderModel({
    image,
    transform,
    opacity: session.opacity,
  });
  const imageBox = toViewportRelativeRenderBox({
    model: imageRenderModel,
    viewportRect,
  });

  return {
    ...base,
    image: {
      src: image.src,
      ...imageBox,
      opacity: imageRenderModel.opacity,
    },
    frame: {
      ...imageBox,
      ownsPointerHitTesting: presentation.ownsPointerHitTesting,
    },
    pins: presentation.arePinsVisible
      ? buildPinsViewModel({
        pins: session.registration.pins,
        transform,
        viewportRect,
        projectMapPinScreenPoint,
      })
      : base.pins,
  };
}

function toViewportRelativeRenderBox({ model, viewportRect }) {
  return {
    left: model.left - viewportRect.left,
    top: model.top - viewportRect.top,
    width: model.width,
    height: model.height,
    rotationDeg: model.rotationDeg,
  };
}

function buildPinsViewModel({
  pins,
  transform,
  viewportRect,
  projectMapPinScreenPoint,
}) {
  const renderedPins = buildPinRenderModels({
    pins,
    transform,
    projectOverlayScreenPoint: (imagePoint) => imagePointToScreenPoint({
      imagePoint,
      transform,
    }),
    projectMapScreenPoint: projectMapPinScreenPoint,
  });

  return {
    overlay: renderedPins.map((pin) => ({
      id: pin.id,
      left: pin.overlayScreenPx.x - viewportRect.left,
      top: pin.overlayScreenPx.y - viewportRect.top,
    })),
    map: renderedPins
      .filter((pin) => pin.mapScreenPx)
      .map((pin) => ({
        id: pin.id,
        left: pin.mapScreenPx.x - viewportRect.left,
        top: pin.mapScreenPx.y - viewportRect.top,
      })),
  };
}
