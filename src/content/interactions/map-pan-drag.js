export function createMapPanDragController({
  mapGesture,
  logger,
}) {
  let activePanSession = null;

  return {
    begin,
    move,
    finish,
    hasActive,
    clear,
  };

  function begin(screenPoint) {
    const panSession = mapGesture.beginMapPan?.(screenPoint) ?? null;
    if (!panSession) {
      logger.warn("Map pan requested, but the map gesture port could not start it");
      return false;
    }
    activePanSession = panSession;
    return true;
  }

  function move(screenPoint) {
    if (!activePanSession) {
      return;
    }
    activePanSession.move(screenPoint);
  }

  function finish(screenPoint) {
    if (!activePanSession) {
      return;
    }
    activePanSession.finish(screenPoint);
    clear();
  }

  function hasActive() {
    return Boolean(activePanSession);
  }

  function clear() {
    activePanSession = null;
  }
}
