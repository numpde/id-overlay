export function isTraceMapLockedSession(session) {
  if (session?.mode !== "trace") {
    return false;
  }
  if (session.placement?.coordinateSpace === "map-world") {
    return true;
  }
  return !session.placement && Boolean(session.registration?.solvedTransform);
}
