export function placementRevisionFromSession(session) {
  return {
    placement: session.placement ?? null,
    solvedRegistration: solvedRegistrationRevisionFromSession(session),
  };
}

export function applyPlacementRevision(session, revision) {
  return withSolvedRegistrationRevision(
    withPlacementRevision(session, revision.placement),
    revision.solvedRegistration,
  );
}

function solvedRegistrationRevisionFromSession(session) {
  if (!session.registration?.solvedPlacement && !session.registration?.solvedTransform) {
    return null;
  }
  return {
    pinIds: (session.registration.pins ?? []).map((pin) => pin.id),
    ...(session.registration.solvedPlacement === undefined ? {} : {
      placement: session.registration.solvedPlacement,
    }),
    ...(session.registration.solvedTransform === undefined ? {} : {
      transform: session.registration.solvedTransform,
    }),
  };
}

function withPlacementRevision(session, placement) {
  if (placement === null) {
    return withoutSessionKeys(session, ["placement"]);
  }
  return {
    ...session,
    placement,
  };
}

function withSolvedRegistrationRevision(session, solvedRegistration) {
  const pins = session.registration?.pins ?? [];
  if (!solvedRegistration || !pinIdsEqual(pins, solvedRegistration.pinIds)) {
    return withoutSolvedRegistration(session);
  }
  return {
    ...session,
    registration: {
      pins,
      ...(solvedRegistration.placement === undefined ? {} : {
        solvedPlacement: solvedRegistration.placement,
      }),
      ...(solvedRegistration.transform === undefined ? {} : {
        solvedTransform: solvedRegistration.transform,
      }),
    },
  };
}

function withoutSolvedRegistration(session) {
  if (!session.registration) {
    return session;
  }
  if ((session.registration.pins ?? []).length === 0) {
    return withoutSessionKeys(session, ["registration"]);
  }
  return {
    ...session,
    registration: {
      pins: session.registration.pins,
    },
  };
}

function withoutSessionKeys(session, keys) {
  const nextSession = {};
  for (const [key, value] of Object.entries(session)) {
    if (!keys.includes(key)) {
      nextSession[key] = value;
    }
  }
  return nextSession;
}

function pinIdsEqual(pins, pinIds) {
  return pins.length === pinIds.length
    && pins.every((pin, index) => pin.id === pinIds[index]);
}
