export function createOpacityWheelCommand({
  machineActions,
  logger,
}) {
  return {
    handleOpacityWheel,
  };

  function handleOpacityWheel({ deltaY }) {
    const result = machineActions.changeOpacityByWheel({ deltaY });
    const nextOpacity = result.state.session.opacity;
    logger.info("Adjusted overlay opacity", {
      opacity: nextOpacity,
      deltaY,
    });
    return true;
  }
}
