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
    primaryAction: {
      label: state.referenceImageInput?.status === "awaiting-paste"
        ? "Cancel paste"
        : "Paste",
      enabled: true,
    },
  };
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
