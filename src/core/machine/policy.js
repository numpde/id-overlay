import {
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "./events.js";

export function selectPanelPolicy(state) {
  const hasImage = Boolean(state.session.image);
  const isAlign = state.session.mode === MACHINE_MODE.ALIGN;
  const pinCount = state.session.registration.pins.length;
  return {
    hasImage,
    isAlign,
    isTrace: state.session.mode === MACHINE_MODE.TRACE,
    pinCount,
    hasPins: pinCount > 0,
    canPaste: !hasImage,
    canClearImage: hasImage,
    canClearPins: hasImage && isAlign && pinCount > 0,
    canSelectAlign: hasImage,
    canSelectTrace: true,
    canSetOpacity: hasImage,
  };
}

export function isPanelIntentValidForState(state, intent = state.panel.intent) {
  const policy = selectPanelPolicy(state);
  switch (intent) {
    case MACHINE_PANEL_INTENT.IDLE:
      return true;
    case MACHINE_PANEL_INTENT.PASTE_ARMED:
      return policy.canPaste;
    case MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM:
      return policy.canClearPins;
    case MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM:
      return policy.canClearImage;
    default:
      return false;
  }
}

export function shouldFitOnTrace(state) {
  const registration = state.session.registration;
  return (
    Boolean(state.session.image) &&
    registration.pins.length >= 2 &&
    (registration.dirty || !registration.solvedTransform)
  );
}
