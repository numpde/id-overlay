export function createKeyboardListeners({
  keyTarget = globalThis.window,
  keyboardGateway = null,
  keydown,
  keyup,
  blur,
}) {
  const unsubscribeGateway = keyboardGateway?.subscribe?.({
    keydown,
    keyup,
    blur,
  }) ?? null;
  if (unsubscribeGateway) {
    return {
      destroy: unsubscribeGateway,
    };
  }

  const keyEventTargets = resolveKeyEventTargets(keyTarget);
  for (const target of keyEventTargets) {
    target?.addEventListener?.("keydown", keydown, true);
    target?.addEventListener?.("keyup", keyup, true);
  }
  keyTarget?.addEventListener?.("blur", blur);

  return {
    destroy() {
      for (const target of keyEventTargets) {
        target?.removeEventListener?.("keydown", keydown, true);
        target?.removeEventListener?.("keyup", keyup, true);
      }
      keyTarget?.removeEventListener?.("blur", blur);
    },
  };
}

function resolveKeyEventTargets(keyTarget) {
  const targets = [];
  if (keyTarget) {
    targets.push(keyTarget);
    const documentTarget = keyTarget.document;
    if (documentTarget && documentTarget !== keyTarget) {
      targets.push(documentTarget);
    }
  }
  return targets;
}
