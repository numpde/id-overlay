export function createBoundedMapGesturePort({
  gestureForwarder,
  runBoundary,
}) {
  // TODO(smell): Map gesture methods still expose imperative begin/update/end
  // ports. The ideal page adapter would accept typed gesture command/fact
  // objects once target resolution and event forwarding are split.
  return {
    beginMapPan(screenPoint) {
      return runBoundary("begin-map-pan", () => {
        return gestureForwarder.beginMapPan(screenPoint);
      }, false);
    },
    updateMapPan(screenPoint) {
      return runBoundary("update-map-pan", () => {
        return gestureForwarder.updateMapPan(screenPoint);
      }, false);
    },
    endMapPan(screenPoint) {
      runBoundary("end-map-pan", () => {
        gestureForwarder.endMapPan(screenPoint);
      });
    },
    forwardMapZoom({ screenPoint, deltaX = 0, deltaY = 0, deltaMode = 0 }) {
      return runBoundary("forward-map-zoom", () => {
        return gestureForwarder.forwardMapZoom({
          screenPoint,
          deltaX,
          deltaY,
          deltaMode,
        });
      }, false);
    },
    isForwardedMapGestureEvent(event) {
      return gestureForwarder.isForwardedMapGestureEvent(event);
    },
  };
}
