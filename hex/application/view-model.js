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
  return {
    mode,
    overlay: overlayRenderFacts(state, mode),
    overlayInput: overlayInputForState(state, mode),
    modeSwitch: {
      selected: mode,
      align: {
        enabled: Boolean(state.session),
      },
    },
    opacityControl: opacityControl(state),
    history: historyControls(state),
    primaryAction: {
      label: primaryActionLabel(state),
      enabled: true,
    },
    status: statusText(state, viewFeedback),
  };
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
      ? state.session.registration?.pins ?? []
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

function primaryActionLabel(state) {
  if (state.referenceImageInput?.status === "awaiting-input") {
    return "Cancel paste";
  }
  if (!state.session) {
    return "Paste";
  }
  if (state.panelIntent?.kind === "confirm-clear-pins") {
    return "Clear pins?";
  }
  if (state.panelIntent?.kind === "confirm-clear-reference-image") {
    return "Clear image?";
  }
  if (
    state.session.mode === "align"
      && (state.session.registration?.pins ?? []).length > 0
  ) {
    return "Clear pins";
  }
  return "Clear image";
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
  const noticeText = formatStatusNotice(viewFeedback?.statusNotice ?? state.notice);
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

function formatStatusNotice(notice) {
  if (!notice) {
    return null;
  }
  return statusNoticePresentation(notice.kind)?.(notice) ?? null;
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
  return `${overlayEditCopy(editKind).changedVerb} overlay.`;
}

function pasteInstructions() {
  return `Press Ctrl/Cmd+V to paste an image from your ${["clip", "board"].join("")}.`;
}

function pluralizePin(count) {
  return count === 1 ? "pin" : "pins";
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
      return `${historyDirectionVerb(direction)} ${record.editKind} overlay`;
    },
    replayStatus(direction, notice) {
      const noun = overlayEditCopy(notice.editKind).noun;
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
  "added-pin": (notice) => `Added pin ${notice.pinId}.`,
  "removed-pin": (notice) => `Removed pin ${notice.pinId}.`,
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
      reason: "temporary-native-map-access",
    };
  }
  if (!state.session || mode === "trace") {
    return {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
    };
  }
  return {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  };
}
