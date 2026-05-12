export function selectDurableApplicationState(state) {
  if (!state.session) {
    return null;
  }
  return {
    session: state.session,
  };
}

export function selectApplicationView(state) {
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
    history: historyControls(state),
    primaryAction: {
      label: primaryActionLabel(state),
      enabled: true,
    },
    status: statusText(state),
  };
}

function overlayRenderFacts(state, mode) {
  if (!state.session) {
    return {
      visible: false,
    };
  }
  return {
    visible: true,
    imageDataRef: state.session.referenceImage.imageDataRef,
    intrinsicSizePx: state.session.referenceImage.intrinsicSizePx,
    placement: state.session.placement ?? null,
    opacity: state.session.opacity ?? 1,
    pins: mode === "align" ? state.session.registration?.pins ?? [] : [],
  };
}

function historyControls(state) {
  const undoRecord = state.history?.past?.at(-1) ?? null;
  const redoRecord = state.history?.future?.at(-1) ?? null;
  return {
    undo: {
      enabled: undoRecord !== null,
      label: undoRecord?.undoLabel ?? null,
    },
    redo: {
      enabled: redoRecord !== null,
      label: redoRecord?.redoLabel ?? null,
    },
  };
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

function statusText(state) {
  if (state.panelIntent?.kind === "confirm-clear-pins") {
    const pinCount = state.session?.registration?.pins?.length ?? 0;
    return `Click Clear pins? again to remove ${pinCount} ${pluralizePin(pinCount)}.`;
  }
  if (state.notice?.kind === "cleared-pins") {
    return `Cleared ${state.notice.count} ${pluralizePin(state.notice.count)}.`;
  }
  if (state.notice?.kind === "reference-image-input-empty") {
    return "Clipboard does not contain an image.";
  }
  if (state.session) {
    const { width, height } = state.session.referenceImage.intrinsicSizePx;
    return `Loaded screenshot ${width}x${height}.`;
  }
  return "";
}

function pluralizePin(count) {
  return count === 1 ? "pin" : "pins";
}

function overlayInputForState(state, mode) {
  if (state.inputOverride?.kind === "temporary-pass-through") {
    return {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
      reason: "temporary-pass-through",
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
