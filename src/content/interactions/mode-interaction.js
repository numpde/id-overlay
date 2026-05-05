import { MACHINE_EVENT_KIND } from "../../core/machine/events.js";

export function createModeInteraction({
  dispatchMachine,
  errorBoundary,
  logger,
}) {
  // TODO(smell): This interaction translates a user mode request directly into
  // the low-level SELECT_MODE command. The final machine ingress should accept
  // the user intent and own validity, auto-fit, history, and status semantics.
  return {
    select,
  };

  function select(mode) {
    return errorBoundary.run("apply-mode", () => {
      dispatchMachine({
        type: MACHINE_EVENT_KIND.SELECT_MODE,
        mode,
      });
      logger.info("Requested mode switch", { mode });
      return true;
    });
  }
}
