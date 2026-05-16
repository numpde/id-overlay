export function clearStatusNotice(state, requestId, { inertResult }) {
  if (state.notice?.requestId !== requestId) {
    return inertResult(state);
  }

  const nextState = {};
  for (const [key, value] of Object.entries(state)) {
    if (key !== "notice") {
      nextState[key] = value;
    }
  }
  return {
    state: nextState,
    effects: [],
  };
}

export function clearPanelIntent(state, command, { inertResult }) {
  if (
    state.panelIntent?.requestId !== command.requestId
      || state.panelIntent?.kind !== command.intentKind
  ) {
    return inertResult(state);
  }

  const nextState = {};
  for (const [key, value] of Object.entries(state)) {
    if (key !== "panelIntent") {
      nextState[key] = value;
    }
  }
  return {
    state: nextState,
    effects: [],
  };
}
