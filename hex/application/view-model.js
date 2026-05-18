import {
  solveRegistrationPlacement,
} from "../domain/registration.js";
import {
  isTraceMapLockedSession,
} from "./map-lock.js";

export function selectDurableApplicationState(state) {
  if (!state.session) {
    return null;
  }
  return {
    session: state.session,
  };
}

export function selectApplicationView(state, viewFeedback = null) {
  const mode = state.session?.mode ?? "trace";
  const overlay = overlayRenderFacts(state, mode);
  return {
    mode,
    panelTitle: panelTitle(state, mode),
    overlay,
    overlayInput: overlayInputForState(state, mode),
    modeSwitch: {
      selected: mode,
      align: {
        enabled: Boolean(state.session),
      },
      trace: {
        enabled: Boolean(state.session),
      },
    },
    opacityControl: opacityControl(state),
    history: historyControls(state),
    primaryAction: primaryAction(state),
    centerOverlayInViewAction: centerOverlayInViewAction(state),
    status: statusText(state, viewFeedback),
  };
}

function panelTitle(state, mode) {
  if (!state.session) {
    return "Overlay: no image";
  }
  return `Overlay: ${mode} mode`;
}

function opacityControl(state) {
  return {
    value: state.session?.opacity ?? 1,
    min: 0,
    max: 1,
    step: 0.01,
    enabled: Boolean(state.session),
  };
}

function overlayRenderFacts(state, mode) {
  if (!state.session) {
    return {
      visible: false,
    };
  }
  const overlay = {
    visible: true,
    imageDataRef: state.session.referenceImage.imageDataRef,
    intrinsicSizePx: state.session.referenceImage.intrinsicSizePx,
    placement: state.session.placement ?? null,
    opacity: state.session.opacity ?? 1,
    pins: areRegistrationPinsVisible(state, mode)
      ? registrationPinsForView(state)
      : [],
  };
  if (mode === "trace" && !overlay.placement && state.session.registration?.solvedTransform) {
    overlay.placement = placementFromSolvedTransform(
      state.session.registration.solvedTransform,
    );
  }
  if (overlay.placement?.coordinateSpace === "map-world") {
    overlay.pageProjectionSource = {
      kind: "map-locked-placement",
      mode,
    };
  }
  return overlay;
}

function placementFromSolvedTransform(transform) {
  return {
    x: transform.tx,
    y: transform.ty,
    scale: transform.scale,
    rotationRad: transform.rotationRad,
    coordinateSpace: "map-world",
  };
}

function historyControls(state) {
  const undoRecord = state.history?.past?.at(-1) ?? null;
  const redoRecord = state.history?.future?.at(-1) ?? null;
  return {
    undo: {
      enabled: undoRecord !== null,
      label: historyLabel(undoRecord, "undo"),
    },
    redo: {
      enabled: redoRecord !== null,
      label: historyLabel(redoRecord, "redo"),
    },
  };
}

function historyLabel(record, direction) {
  if (!record) {
    return null;
  }
  return historyPresentation(record.kind)?.controlLabel?.(direction, record) ?? null;
}

function primaryAction(state) {
  if (state.referenceImageInput?.status === "awaiting-input") {
    return primaryActionDescriptor({
      kind: "cancel-reference-image-input",
      label: "Cancel paste",
    });
  }
  if (!state.session) {
    return primaryActionDescriptor({
      kind: "request-reference-image",
      label: "Paste",
    });
  }
  if (state.panelIntent?.kind === "confirm-clear-pins") {
    return primaryActionDescriptor({
      kind: "confirm-clear-pins",
      label: "Clear pins?",
      tone: "danger",
      confirmation: "armed",
    });
  }
  if (state.panelIntent?.kind === "confirm-clear-reference-image") {
    return primaryActionDescriptor({
      kind: "confirm-clear-reference-image",
      label: "Clear image?",
      tone: "danger",
      confirmation: "armed",
    });
  }
  if (
    state.session.mode === "align"
      && (state.session.registration?.pins ?? []).length > 0
  ) {
    return primaryActionDescriptor({
      kind: "arm-clear-pins",
      label: "Clear pins",
    });
  }
  return primaryActionDescriptor({
    kind: "arm-clear-reference-image",
    label: "Clear image",
  });
}

function primaryActionDescriptor({
  kind,
  label,
  tone = "normal",
  confirmation = "none",
}) {
  return {
    kind,
    label,
    enabled: true,
    tone,
    confirmation,
  };
}

function centerOverlayInViewAction(state) {
  return {
    kind: "center-overlay-in-view",
    label: "Center overlay in view",
    enabled: Boolean(state.session) && !isTraceMapLockedSession(state.session),
    icon: "center-overlay",
  };
}

function statusText(state, viewFeedback) {
  if (state.referenceImageInput?.status === "awaiting-input") {
    return pasteInstructions();
  }
  if (state.panelIntent?.kind === "confirm-clear-reference-image") {
    return "Click Clear image? again to remove the current screenshot, placement, and pins.";
  }
  if (state.panelIntent?.kind === "confirm-clear-pins") {
    return "Click Clear pins? again to remove the current registration pins.";
  }
  const noticeText = formatStatusNotice({
    notice: viewFeedback?.statusNotice ?? state.notice,
    state,
  });
  if (noticeText !== null) {
    return noticeText;
  }
  if (!state.session) {
    return "Paste a screenshot to begin.";
  }
  return state.session.mode === "align"
    ? "Align image to the map."
    : "Trace using the aligned image.";
}

function formatStatusNotice({ notice, state }) {
  if (!notice) {
    return null;
  }
  return statusNoticePresentation(notice.kind)?.(notice, state) ?? null;
}

function historyReplayText(notice) {
  return historyPresentation(notice.historyKind)?.replayStatus?.(notice.direction, notice)
    ?? (notice.direction === "undo" ? "Change undone." : "Change redone.");
}

function statusImageNoun() {
  return ["Im", "age"].join("");
}

function loadedScreenshotText(referenceImage) {
  const { width, height } = referenceImage.intrinsicSizePx;
  return `Loaded screenshot ${width}x${height}.`;
}

function placementChangedText(editKind) {
  if (editKind === "center-overlay") {
    return "Overlay centered in view.";
  }
  return `${overlayEditCopy(editKind).changedVerb} overlay.`;
}

function pasteInstructions() {
  return `Press Ctrl/Cmd+V to paste an image from your ${["clip", "board"].join("")}.`;
}

function pluralizePin(count) {
  return count === 1 ? "pin" : "pins";
}

function registrationPinsForView(state) {
  const pins = state.session.registration?.pins ?? [];
  const dangerousPinIds = dangerousRegistrationPinIds(pins);
  return pins.map((pin, index) => ({
    ...pin,
    label: String(index + 1),
    ...(dangerousPinIds.has(pin.id) ? {
      tone: "danger",
    } : {}),
  }));
}

function registrationPinTone(pins) {
  return dangerousRegistrationPinIds(pins).size > 0 ? "danger" : "normal";
}

function dangerousRegistrationPinIds(pins) {
  if (pins.length < 2) {
    return new Set();
  }
  const solve = solveRegistrationPlacement({ pins });
  if (solve.kind === "solved") {
    return new Set(solve.incoherentPinIds ?? []);
  }
  if (solve.reason === "insufficient-pins") {
    return new Set();
  }
  return new Set(solve.pinIds ?? pins.map((pin) => pin.id));
}

const HISTORY_PRESENTATION = Object.freeze({
  "load-reference-image": {
    controlLabel(direction) {
      return direction === "undo" ? "Remove image" : "Reload image";
    },
    replayStatus(direction) {
      return direction === "undo"
        ? `${statusImageNoun()} cleared.`
        : `${statusImageNoun()} reloaded.`;
    },
  },
  "remove-reference-image": {
    controlLabel(direction) {
      return direction === "undo" ? "Reload image" : "Remove image";
    },
    replayStatus(direction) {
      return direction === "undo"
        ? `${statusImageNoun()} reloaded.`
        : `${statusImageNoun()} cleared.`;
    },
  },
  "replace-reference-image": {
    controlLabel(direction) {
      return direction === "undo" ? "Restore previous image" : "Replace image";
    },
    replayStatus(direction) {
      return direction === "undo"
        ? "Previous image restored."
        : `${statusImageNoun()} replaced.`;
    },
  },
  "overlay-placement-edit": {
    controlLabel(direction, record) {
      if (record.editKind === "center-overlay") {
        return `${historyDirectionVerb(direction)} center overlay`;
      }
      return `${historyDirectionVerb(direction)} ${record.editKind} overlay`;
    },
    replayStatus(direction, notice) {
      const noun = overlayEditCopy(notice.editKind).noun;
      if (notice.editKind === "center-overlay") {
        return `${noun} ${historyReplayVerb(direction)}.`;
      }
      return `Overlay ${noun} ${historyReplayVerb(direction)}.`;
    },
  },
  "registration-pin-edit": {
    controlLabel(direction) {
      return `${historyDirectionVerb(direction)} pin edit`;
    },
    replayStatus(direction) {
      return `Pin edit ${historyReplayVerb(direction)}.`;
    },
  },
  "clear-registration-pins": {
    controlLabel(direction) {
      return direction === "undo" ? "Restore pins" : "Clear pins";
    },
    replayStatus(direction) {
      return direction === "undo" ? "Pins restored." : "Pins cleared.";
    },
  },
  "fit-registration-placement": {
    controlLabel(direction) {
      return `${historyDirectionVerb(direction)} fit overlay`;
    },
    replayStatus(direction) {
      return `Overlay fit ${historyReplayVerb(direction)}.`;
    },
  },
});

const STATUS_NOTICE_PRESENTATION = Object.freeze({
  "reference-image-loaded": (notice) => loadedScreenshotText(notice.referenceImage),
  "reference-image-cleared": () => `${statusImageNoun()} cleared.`,
  "mode-selected": (notice) => `Switched to ${notice.mode}.`,
  "added-pin": addedPinText,
  "removed-pin": (notice) => `Removed pin ${statusPinLabel(notice)}.`,
  "cleared-pins": (notice) => (
    `Cleared ${notice.count} ${pluralizePin(notice.count)}.`
  ),
  "overlay-fitted": (notice) => (
    `Fit overlay from ${notice.pinCount} ${pluralizePin(notice.pinCount)}.`
  ),
  "placement-changed": (notice) => placementChangedText(notice.editKind),
  "reference-image-input-cancelled": pasteCancelledText,
  "reference-image-replacement-cancelled": pasteCancelledText,
  "reference-image-input-empty": clipboardMissingText,
  "reference-image-replacement-empty": clipboardMissingText,
  "reference-image-input-failed": referenceImageFailedText,
  "reference-image-replacement-failed": referenceImageFailedText,
  "history-replayed": historyReplayText,
  "history-empty": (notice) => (
    notice.direction === "redo" ? "Nothing to redo." : "Nothing to undo."
  ),
});

const OVERLAY_EDIT_COPY = Object.freeze({
  move: {
    changedVerb: "Moved",
    noun: "move",
  },
  rotate: {
    changedVerb: "Rotated",
    noun: "rotation",
  },
  scale: {
    changedVerb: "Scaled",
    noun: "scale",
  },
  "center-overlay": {
    changedVerb: "Centered",
    noun: "Overlay center",
  },
});

function historyPresentation(kind) {
  return HISTORY_PRESENTATION[kind];
}

function statusNoticePresentation(kind) {
  return STATUS_NOTICE_PRESENTATION[kind];
}

function historyDirectionVerb(direction) {
  return direction === "undo" ? "Undo" : "Redo";
}

function historyReplayVerb(direction) {
  return direction === "undo" ? "undone" : "redone";
}

function overlayEditCopy(editKind) {
  return OVERLAY_EDIT_COPY[editKind] ?? {
    changedVerb: "Adjusted",
    noun: "change",
  };
}

function addedPinText(notice, state) {
  const base = `Added pin ${statusPinLabel(notice)}.`;
  return registrationPinTone(state.session?.registration?.pins ?? []) === "danger"
    ? `${base} Pins cannot fit one transform; red pins need adjustment.`
    : base;
}

function statusPinLabel(notice) {
  return notice.pinLabel ?? String(notice.pinId);
}

function pasteCancelledText() {
  return "Paste cancelled.";
}

function clipboardMissingText() {
  return "Clipboard does not contain an image.";
}

function referenceImageFailedText(notice) {
  return notice.reason === "decode-failed"
    ? "Clipboard image could not be read."
    : "Clipboard image could not be loaded.";
}

function areRegistrationPinsVisible(state, mode) {
  return mode === "align" && state.inputOverride?.kind !== "temporary-native-map-access";
}

function overlayInputForState(state, mode) {
  if (state.inputOverride?.kind === "temporary-native-map-access") {
    return {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
      pointerAffordances: {
        default: "native-map-pass-through",
      },
      reason: "temporary-native-map-access",
    };
  }
  if (!state.session || mode === "trace") {
    return {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
      pointerAffordances: {
        default: "native-map-pass-through",
      },
    };
  }
  return {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
    pointerAffordances: {
      default: "native-map-pan",
      shift: "move-overlay",
      ctrl: "scale-overlay",
      alt: "rotate-overlay",
    },
  };
}
