import {
  INPUT_KEY,
} from "../input-facts.js";
import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "./events.js";

export const MACHINE_PANEL_PRIMARY_ACTION_KIND = Object.freeze({
  PASTE: "paste",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS: "clear-pins",
  CONFIRM_CLEAR_PINS: "confirm-clear-pins",
  CLEAR_IMAGE: "clear-image",
  CONFIRM_CLEAR_IMAGE: "confirm-clear-image",
});

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

export function selectPanelPrimaryAction(state) {
  const policy = selectPanelPolicy(state);
  if (policy.canPaste) {
    return createPanelPrimaryAction({
      kind: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED
        ? MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE_ARMED
        : MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE,
      label: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED ? "Paste…" : "Paste",
      intent: state.panel.intent,
    });
  }
  if (policy.canClearPins) {
    if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
      return createPanelPrimaryAction({
        kind: MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_PINS,
        label: "Clear pins?",
        intent: state.panel.intent,
        presentationKind: "confirm",
      });
    }
    return createPanelPrimaryAction({
      kind: MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_PINS,
      label: resolveClearPinsLabel(policy.pinCount),
      intent: state.panel.intent,
    });
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return createPanelPrimaryAction({
      kind: MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_IMAGE,
      label: "Clear image?",
      intent: state.panel.intent,
      presentationKind: "confirm",
    });
  }
  return createPanelPrimaryAction({
    kind: MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_IMAGE,
    label: "Clear image",
    intent: state.panel.intent,
  });
}

export function selectOverlaySessionPolicy(state) {
  const base = selectBaseInteractionPolicy(state);
  return {
    hasImage: base.hasImage,
    mode: base.mode,
    isNativeMapInput: !base.canEditOverlay,
    canEditOverlay: base.canEditOverlay,
    arePinsVisible: base.canEditOverlay,
  };
}

export function selectOverlayInputPolicy(state, runtime = null) {
  const sessionPolicy = selectOverlaySessionPolicy(state);
  const runtimeState = runtime ?? state.runtime ?? null;
  const hasInputPassThrough = runtimeState?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH;
  return {
    isPassThrough: sessionPolicy.isNativeMapInput || hasInputPassThrough,
    ownsPointerHitTesting: sessionPolicy.canEditOverlay && !hasInputPassThrough,
  };
}

function createPanelPrimaryAction({
  kind,
  label,
  intent,
  presentationKind = "neutral",
}) {
  return {
    kind,
    label,
    intent,
    disabled: false,
    presentationKind,
  };
}

function resolveClearPinsLabel(pinCount) {
  if (pinCount === 1) {
    return "Clear 1 pin";
  }
  if (pinCount > 1) {
    return `Clear ${pinCount} pins`;
  }
  return "Clear pins";
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

export function shouldReleasePassThroughOverride(state, runtime, keyboard = null) {
  const session = state?.session ?? state ?? {};
  return (
    keyboard?.key === INPUT_KEY.SPACE &&
    (
      session.mode === MACHINE_MODE.ALIGN ||
      runtime?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    )
  );
}
