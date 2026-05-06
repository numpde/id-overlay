export function createMapPanDragController({
  mapGesture,
  logger,
}) {
  let active = false;

  return {
    begin,
    move,
    finish,
    hasActive,
    clear,
  };

  function begin(screenPoint) {
    const beganMapPan = mapGesture.beginMapPan?.(screenPoint) === true;
    if (!beganMapPan) {
      logger.warn("Map pan requested, but the map gesture port could not start it");
      return false;
    }
    active = true;
    return true;
  }

  function move(screenPoint) {
    if (!active) {
      return;
    }
    mapGesture.updateMapPan(screenPoint);
  }

  function finish(screenPoint) {
    if (!active) {
      return;
    }
    mapGesture.endMapPan?.(screenPoint);
    clear();
  }

  function hasActive() {
    return active;
  }

  function clear() {
    active = false;
  }
}
