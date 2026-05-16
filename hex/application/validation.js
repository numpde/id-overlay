import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "./command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "./errors.js";
import {
  isPlacementData,
} from "./placement.js";
import {
  isPlainData,
} from "./plain-data.js";
import {
  isReferenceImageData,
} from "./reference-image.js";

export function assertValidState(state) {
  if (!isPlainData(state) || state === null || Array.isArray(state)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
      "Invalid application state.",
    );
  }
}

export function assertValidCommand(command) {
  if (!isPlainData(command) || command === null || Array.isArray(command)) {
    if (isKnownCommandObject(command)) {
      throwBoundary(
        APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
        "Invalid application command.",
      );
    }
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
      "Unknown application command.",
    );
  }
  if (!isKnownCommandObject(command)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
      "Unknown application command.",
    );
  }

  const { kind, ...payload } = command;
  createApplicationCommand(kind, payload);
}

export function assertSupportedDurableState(durableState) {
  if (!isPlainData(durableState)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE,
      "Invalid durable state.",
    );
  }
  const durableKeys = Object.keys(durableState);
  for (const key of durableKeys) {
    if (key !== "session") {
      throwBoundary(
        APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
        "Unsupported durable state.",
      );
    }
  }
  const sessionKeys = durableState.session ? Object.keys(durableState.session) : [];
  for (const key of sessionKeys) {
    if (!["mode", "referenceImage", "registration", "placement", "opacity"].includes(key)) {
      throwBoundary(
        APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
        "Unsupported durable state.",
      );
    }
  }
  if (!isSupportedSession(durableState.session)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
      "Unsupported durable state.",
    );
  }
}

function isKnownCommandObject(command) {
  return command
    && typeof command === "object"
    && !Array.isArray(command)
    && Object.values(APPLICATION_COMMAND_KIND).includes(command.kind);
}

function isSupportedSession(session) {
  return session
    && typeof session === "object"
    && !Array.isArray(session)
    && ["align", "trace"].includes(session.mode)
    && isReferenceImageData(session.referenceImage)
    && (session.registration === undefined || isRegistrationData(session.registration))
    && (session.placement === undefined || isPlacementData(session.placement))
    && (session.opacity === undefined || isOpacityData(session.opacity));
}

function isRegistrationData(registration) {
  if (
    !registration
      || typeof registration !== "object"
      || Array.isArray(registration)
  ) {
    return false;
  }
  for (const key of Object.keys(registration)) {
    if (!["pins", "solvedPlacement", "solvedTransform"].includes(key)) {
      return false;
    }
  }
  return Array.isArray(registration.pins)
    && registration.pins.every(isRegistrationPinData)
    && (
      registration.solvedPlacement === undefined
        || isPlacementData(registration.solvedPlacement)
    )
    && (
      registration.solvedTransform === undefined
        || isSolvedTransformData(registration.solvedTransform)
    );
}

function isSolvedTransformData(transform) {
  return transform
    && typeof transform === "object"
    && !Array.isArray(transform)
    && transform.type === "image-to-map-world"
    && Number.isFinite(transform.a)
    && Number.isFinite(transform.b)
    && Number.isFinite(transform.tx)
    && Number.isFinite(transform.ty)
    && Number.isFinite(transform.scale)
    && Number.isFinite(transform.rotationRad)
    && (
      transform.pinIds === undefined
        || (
          Array.isArray(transform.pinIds)
            && transform.pinIds.every((id) => Number.isInteger(id) && id > 0)
        )
    );
}

function isRegistrationPinData(pin) {
  return pin
    && typeof pin === "object"
    && !Array.isArray(pin)
    && isPositiveInteger(pin.id)
    && isPointData(pin.imagePx)
    && isLatLonData(pin.mapLatLon);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPointData(value) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y);
}

function isLatLonData(value) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lon);
}

function isOpacityData(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function throwBoundary(code, message) {
  throw new ApplicationBoundaryError({ code, message });
}
