import { MACHINE_EVENT_KIND } from "../../core/machine/events.js";

export function createModeInteraction({
  dispatchMachine,
  runtimeBridge,
  errorBoundary,
  logger,
}) {
  return {
    select,
  };

  function select(mode) {
    // TODO(smell): Mode selection still performs local input cleanup before
    // sending the semantic machine event. The cleanup should be a consequence of
    // the mode transition, not choreography repeated by the content adapter.
    return errorBoundary.run("apply-mode", () => {
      runtimeBridge.reset({
        pointerScreenPx: runtimeBridge.getPointerScreenPx(),
      });
      dispatchMachine({
        type: MACHINE_EVENT_KIND.SELECT_MODE,
        mode,
      });
      logger.info("Requested mode switch", { mode });
      return true;
    });
  }
}
