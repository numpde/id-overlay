import { MACHINE_EVENT_KIND } from "../../core/machine/events.js";

export function createModeInteraction({
  dispatchMachine,
  errorBoundary,
  logger,
}) {
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
