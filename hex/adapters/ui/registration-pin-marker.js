const REGISTRATION_PIN_MARKER_GEOMETRY = Object.freeze({
  sizePx: 42,
  borderPx: 6,
  fontPx: 30,
});

export const REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION = Object.freeze({
  ...REGISTRATION_PIN_MARKER_GEOMETRY,
  opacity: 1,
});

export const REGISTRATION_MAP_PIN_MARKER_PRESENTATION = Object.freeze({
  ...REGISTRATION_PIN_MARKER_GEOMETRY,
  opacity: 0.55,
});

export const REGISTRATION_PIN_MARKER_TONE_PRESENTATION = Object.freeze({
  normal: Object.freeze({
    tone: "normal",
    background: "rgba(37, 99, 235, 0.92)",
  }),
  danger: Object.freeze({
    tone: "danger",
    background: "rgba(220, 38, 38, 0.92)",
  }),
});

export const REGISTRATION_PIN_MARKER_HIT_TARGET_MIN_SIZE_PX = 24;
export const REGISTRATION_PIN_MARKER_HIT_RADIUS_SCREEN_PX = registrationPinMarkerHitRadiusScreenPx({
  markerSizePx: REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION.sizePx,
});

export function registrationPinMarkerHitRadiusScreenPx({ markerSizePx }) {
  return Math.max(markerSizePx, REGISTRATION_PIN_MARKER_HIT_TARGET_MIN_SIZE_PX) / 2;
}

export function registrationPinMarkerTonePresentation(tone) {
  return tone === "danger"
    ? REGISTRATION_PIN_MARKER_TONE_PRESENTATION.danger
    : REGISTRATION_PIN_MARKER_TONE_PRESENTATION.normal;
}
