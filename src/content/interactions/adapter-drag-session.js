export function createAdapterDragSessionController({
  sessions,
}) {
  let activeSession = null;

  return {
    begin,
    move,
    end,
    cancel,
    hasActive,
    getActiveDragMode,
    clear,
  };

  function begin({ button, screenPoint, dragMode }) {
    if (button !== 0) {
      return false;
    }
    const nextSession = resolveSession(dragMode);
    if (!nextSession) {
      return false;
    }
    clearInactiveSessions(nextSession);
    if (!nextSession.begin(screenPoint)) {
      return false;
    }
    activeSession = nextSession;
    return true;
  }

  function move(screenPoint) {
    activeSession?.move(screenPoint);
  }

  function end(screenPoint) {
    if (!activeSession) {
      return false;
    }
    activeSession.move(screenPoint);
    activeSession.finish(screenPoint, { commitPlacement: true });
    activeSession = null;
    return true;
  }

  function cancel(endPointerScreenPx, { commitPlacement }) {
    if (!activeSession) {
      return;
    }
    activeSession.finish(endPointerScreenPx, { commitPlacement });
    activeSession = null;
  }

  function hasActive() {
    return Boolean(activeSession);
  }

  function getActiveDragMode() {
    return activeSession?.dragMode ?? null;
  }

  function clear() {
    activeSession = null;
    for (const session of sessions) {
      session.clear();
    }
  }

  function resolveSession(dragMode) {
    return sessions.find((session) => session.acceptsDragMode(dragMode)) ?? null;
  }

  function clearInactiveSessions(nextSession) {
    for (const session of sessions) {
      if (session !== nextSession) {
        session.clear();
      }
    }
  }
}
