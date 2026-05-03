import {
  MACHINE_INPUT_OVERRIDE,
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
    canEditOverlay: hasImage && isAlign,
    canPaste: !hasImage,
    canClearImage: hasImage,
    canClearPins: hasImage && isAlign && pinCount > 0,
    canSelectAlign: hasImage,
    canSelectTrace: true,
    canSetOpacity: hasImage,
  };
}

export function selectOverlayPolicy(state, runtime = null) {
  const session = state.session ?? state;
  const hasImage = Boolean(session.image);
  const isAlign = session.mode === MACHINE_MODE.ALIGN;
  const runtimeState = runtime ?? state.runtime ?? null;
  const hasInputPassThrough = runtimeState?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH;
  const isNativeMapInput = !hasImage || !isAlign;
  const canEditOverlay = hasImage && isAlign;
  return {
    hasImage,
    mode: session.mode,
    isNativeMapInput,
    isPassThrough: isNativeMapInput || hasInputPassThrough,
    canEditOverlay,
    arePinsVisible: canEditOverlay,
    ownsPointerHitTesting: canEditOverlay && !hasInputPassThrough,
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
