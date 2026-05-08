export function createBoundedMapGesturePort({
  gestureForwarder,
  runBoundary,
}) {
  return {
    beginMapPan(screenPoint) {
      const session = runGesture("begin-map-pan", () => {
        return gestureForwarder.beginMapPan(screenPoint);
      });
      return session ? createBoundedMapPanSession(session) : null;
    },
    forwardMapZoom({ screenPoint, deltaX = 0, deltaY = 0, deltaMode = 0 }) {
      return runBooleanGesture("forward-map-zoom", () => {
        return gestureForwarder.forwardMapZoom({
          screenPoint,
          deltaX,
          deltaY,
          deltaMode,
        });
      });
    },
    isForwardedMapGestureEvent(event) {
      return gestureForwarder.isForwardedMapGestureEvent(event);
    },
  };

  function runGesture(operation, forward) {
    const result = runBoundary(operation, forward);
    return result.ok ? result.value : null;
  }

  function runBooleanGesture(operation, forward) {
    const result = runBoundary(operation, forward);
    return result.ok ? result.value : false;
  }

  function createBoundedMapPanSession(session) {
    return Object.freeze({
      move(screenPoint) {
        return runGesture("update-map-pan", () => {
          return session.move(screenPoint);
        }) === true;
      },
      finish(screenPoint) {
        runBoundary("end-map-pan", () => {
          session.finish(screenPoint);
        });
      },
    });
  }
}
