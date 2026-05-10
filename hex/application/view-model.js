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
    overlayInput: overlayInputForMode(mode, Boolean(state.session)),
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
  if (state.referenceImageInput?.status === "awaiting-paste") {
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

function overlayInputForMode(mode, hasSession) {
  if (!hasSession || mode === "trace") {
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
