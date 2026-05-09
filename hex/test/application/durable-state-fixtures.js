// Durable-state effects are generic application output. The payload is a
// snapshot of durable product facts; callers decide what, if anything, to do
// with that notification.

export function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
