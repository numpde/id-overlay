export function createTimerPortAdapter({ setTimer, clearTimer }) {
  const handles = new Map();
  return {
    startTimer({ requestId, delayMs, purpose }) {
      return new Promise((resolve) => {
        const handle = setTimer(delayMs, () => {
          handles.delete(requestId);
          resolve({
            kind: "timer-fired",
            requestId,
            purpose,
          });
        });
        handles.set(requestId, handle);
      });
    },
    cancelTimer({ requestId }) {
      const handle = handles.get(requestId);
      if (handle) {
        clearTimer(handle);
        handles.delete(requestId);
      }
    },
  };
}
