export function createTimerPortAdapter({ setTimer, clearTimer }) {
  const handlesByScheduleId = new Map();
  return {
    scheduleApplicationCommand({
      scheduleId,
      delayMs,
      command,
      dispatchApplicationCommand,
    }) {
      const previousHandle = handlesByScheduleId.get(scheduleId);
      if (previousHandle) {
        clearTimer(previousHandle);
      }

      const handle = setTimer(delayMs, async () => {
        if (handlesByScheduleId.get(scheduleId) !== handle) {
          return;
        }
        handlesByScheduleId.delete(scheduleId);
        await dispatchApplicationCommand(command);
      });
      handlesByScheduleId.set(scheduleId, handle);
    },
  };
}
