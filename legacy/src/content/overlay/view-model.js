import {
  imagePointToScreenPoint,
  isImagePointWithinBounds,
  screenPointToRenderedImagePoint,
} from "../../core/transform.js";
import {
  buildOverlayRenderModel,
  resolveOverlayScreenTransform,
} from "../../core/overlay-render.js";
import { buildPinRenderModels } from "../../core/pin-render.js";
import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import {
  selectOverlayInputPolicy,
  selectOverlaySessionPolicy,
} from "../../core/machine/policy.js";

export function buildOverlayViewModel({
  machineState,
  runtime,
  snapshot,
  projectMapPinScreenPoint = null,
}) {
  const session = machineState.session;
  const viewportRect = snapshot.viewportRect;
  const localViewportRect = snapshot.localViewportRect ?? viewportRect;
  const sessionPolicy = selectOverlaySessionPolicy(machineState);
  const inputPolicy = selectOverlayInputPolicy(machineState, runtime);
  const base = {
    viewport: {
      mode: sessionPolicy.mode,
      isPassThrough: inputPolicy.isPassThrough,
      rect: localViewportRect,
    },
    mapLayer: {
      transformOriginCss: snapshot.surfaceMotion.transformOriginCss,
      transformCss: snapshot.surfaceMotion.transformCss,
    },
    image: null,
    frame: null,
    hitTarget: null,
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
      ownsPointerHitTesting: inputPolicy.ownsPointerHitTesting,
    },
    hitTarget: {
      image: {
        width: image.width,
        height: image.height,
      },
      transform,
      viewportRect,
      surfaceMotion: snapshot.surfaceMotion,
    },
    pins: sessionPolicy.arePinsVisible
      ? buildPinsViewModel({
        pins: session.registration.pins,
        transform,
        viewportRect,
        projectMapPinScreenPoint,
      })
      : base.pins,
  };
}

export function isScreenPointOverOverlayViewModel({ viewModel, screenPoint }) {
  const target = viewModel?.hitTarget;
  if (!target) {
    return false;
  }

  const imagePoint = screenPointToRenderedImagePoint({
    screenPoint,
    transform: target.transform,
    snapshot: {
      viewportRect: target.viewportRect,
      surfaceMotion: target.surfaceMotion,
    },
  });
  return isImagePointWithinBounds(imagePoint, target.image);
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
