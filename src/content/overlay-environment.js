export function createOverlayEnvironment({
  pagePorts,
  machineHost,
  overlayInteractions,
}) {
  return Object.freeze({
    pageObservation: pagePorts.pageObservation,
    pageProjection: pagePorts.pageProjection,
    isForwardedMapGestureEvent: pagePorts.mapGesture.isForwardedMapGestureEvent,
    machineHost,
    overlayInteractions,
  });
}
