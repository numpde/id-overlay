import { createInteractionPorts } from "./interaction-ports.js";

export function createInteractionController(options) {
  const interactionPorts = createInteractionPorts(options);
  const { overlayInteractionPort } = interactionPorts;
  return {
    destroy: interactionPorts.destroy,
    subscribe: overlayInteractionPort.subscribeRuntime,
    subscribeRuntime: overlayInteractionPort.subscribeRuntime,
    getRuntimeState: overlayInteractionPort.getRuntimeState,
    handlePointerEnter: overlayInteractionPort.handlePointerEnter,
    handlePointerLeave: overlayInteractionPort.handlePointerLeave,
    handlePointerMove: overlayInteractionPort.handlePointerMove,
    handlePointerDown: overlayInteractionPort.handlePointerDown,
    handlePointerUp: overlayInteractionPort.handlePointerUp,
    handlePointerCancel: overlayInteractionPort.handlePointerCancel,
    handleWheel: overlayInteractionPort.handleWheel,
    handleTogglePin: overlayInteractionPort.handleTogglePin,
    reportRuntimeError: overlayInteractionPort.reportRuntimeError,
  };
}
