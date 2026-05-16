export function createGestureForwardingAdapter({
  forwardGesture = null,
  readActiveMapGestureContext = null,
  dispatchForwardedPointer = () => {},
  dispatchForwardedWheel = () => {},
}) {
  return {
    async forward(gestureFact) {
      return forwardGesture(gestureFact);
    },
    beginMapPan({ screenPx }) {
      const context = readActiveMapGestureContext?.({
        gestureKind: "pan",
        screenPx,
      });
      if (!context) {
        return null;
      }
      const panContext = {
        frameScreenPx: context.frameScreenPx,
        startTarget: context.panTarget ?? selectMapTarget(context),
        continuationTarget: context.continuationTarget ?? selectMapTarget(context) ?? context.panTarget,
      };
      if (!panContext.startTarget) {
        return null;
      }
      dispatchForwardedPointer({
        phase: "start",
        target: panContext.startTarget,
        clientPx: toClientPx(screenPx, panContext.frameScreenPx),
        forwarded: true,
      });
      return {
        move({ screenPx: moveScreenPx }) {
          dispatchForwardedPointer({
            phase: "move",
            target: panContext.continuationTarget,
            clientPx: toClientPx(moveScreenPx, panContext.frameScreenPx),
            forwarded: true,
          });
        },
        finish({ screenPx: finishScreenPx }) {
          dispatchForwardedPointer({
            phase: "end",
            target: panContext.continuationTarget,
            clientPx: toClientPx(finishScreenPx, panContext.frameScreenPx),
            forwarded: true,
          });
        },
      };
    },
    forwardMapZoom({ screenPx, deltaY }) {
      const context = readActiveMapGestureContext?.({
        gestureKind: "zoom",
        screenPx,
      });
      const target = selectMapTarget(context);
      if (!context || !target) {
        return false;
      }
      dispatchForwardedWheel({
        target,
        clientPx: toClientPx(screenPx, context.frameScreenPx),
        deltaY,
        forwarded: true,
      });
      return true;
    },
  };
}

function selectMapTarget(context) {
  if (!context) {
    return null;
  }
  if (context.panTarget && !context.hitTestStack) {
    return context.panTarget;
  }
  const extensionOwnedTargets = new Set(context.extensionOwnedTargets ?? []);
  return (context.hitTestStack ?? []).find((target) => !extensionOwnedTargets.has(target)) ?? null;
}

function toClientPx(screenPx, frameScreenPx = { x: 0, y: 0 }) {
  return {
    x: screenPx.x - frameScreenPx.x,
    y: screenPx.y - frameScreenPx.y,
  };
}
