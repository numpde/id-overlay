import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "./events.js";

export function selectPanelPolicy(state) {
  const base = selectBaseInteractionPolicy(state);
  return {
    hasImage: base.hasImage,
    isAlign: base.isAlign,
    isTrace: base.isTrace,
    pinCount: base.pinCount,
    hasPins: base.hasPins,
    canEditOverlay: base.canEditOverlay,
    canPaste: !base.hasImage,
    canClearImage: base.hasImage,
    canClearPins: base.canEditOverlay && base.hasPins,
    canSelectAlign: base.hasImage,
    canSetOpacity: base.hasImage,
  };
}

export function selectOverlayPolicy(state, runtime = null) {
  const base = selectBaseInteractionPolicy(state);
  const runtimeState = runtime ?? state.runtime ?? null;
  const hasInputPassThrough = runtimeState?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH;
  const isNativeMapInput = !base.canEditOverlay;
  return {
    hasImage: base.hasImage,
    mode: base.mode,
    isNativeMapInput,
    isPassThrough: isNativeMapInput || hasInputPassThrough,
    canEditOverlay: base.canEditOverlay,
    arePinsVisible: base.canEditOverlay,
    ownsPointerHitTesting: base.canEditOverlay && !hasInputPassThrough,
  };
}

function selectBaseInteractionPolicy(state) {
  const session = state.session ?? state;
  const hasImage = Boolean(session.image);
  const mode = session.mode;
  const isAlign = mode === MACHINE_MODE.ALIGN;
  const pinCount = session.registration?.pins?.length ?? 0;
  return {
    hasImage,
    mode,
    isAlign,
    isTrace: mode === MACHINE_MODE.TRACE,
    pinCount,
    hasPins: pinCount > 0,
    canEditOverlay: hasImage && isAlign,
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

export function shouldReleasePassThroughOverride(state, runtime, event) {
  const session = state?.session ?? state ?? {};
  return (
    event?.code === "Space" &&
    (
      session.mode === MACHINE_MODE.ALIGN ||
      runtime?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    )
  );
}
