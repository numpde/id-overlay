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

export function selectOverlayPolicy(state, runtime = null) {
  // TODO(smell): Overlay policy currently mixes durable mode, native-map input,
  // and transient pass-through in one selector. Once user/fact ingress is split,
  // keep durable editability and transient input ownership as distinct derived
  // facts so content cannot infer transition semantics from presentation flags.
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

export function shouldReleasePassThroughOverride(state, runtime, event) {
  // TODO(smell): Keyboard release policy accepts a DOM-ish event object in core.
  // The final input boundary should pass normalized keyboard facts, not browser
  // event shape, into machine policy.
  const session = state?.session ?? state ?? {};
  return (
    event?.code === "Space" &&
    (
      session.mode === MACHINE_MODE.ALIGN ||
      runtime?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    )
  );
}
