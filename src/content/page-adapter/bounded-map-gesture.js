export function createBoundedMapGesturePort({
  gestureForwarder,
  runBoundary,
}) {
  // TODO(smell): Map gesture methods still expose imperative begin/update/end
  // ports. The ideal page adapter would accept typed gesture command/fact
  // objects once target resolution and event forwarding are split.
  return {
    beginMapPan(screenPoint) {
      return runGesture("begin-map-pan", () => {
        return gestureForwarder.beginMapPan(screenPoint);
      });
    },
    updateMapPan(screenPoint) {
      return runGesture("update-map-pan", () => {
        return gestureForwarder.updateMapPan(screenPoint);
      });
    },
    endMapPan(screenPoint) {
      runBoundary("end-map-pan", () => {
        gestureForwarder.endMapPan(screenPoint);
      });
    },
    forwardMapZoom({ screenPoint, deltaX = 0, deltaY = 0, deltaMode = 0 }) {
      return runGesture("forward-map-zoom", () => {
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
    return result.ok ? result.value : false;
  }
}
