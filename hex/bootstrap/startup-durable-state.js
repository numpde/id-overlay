import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";
import {
  ApplicationBoundaryError,
} from "../application/errors.js";
import {
  handleApplicationCommand,
} from "../application/handle-command.js";
import {
  createInitialApplicationState,
} from "../application/state.js";
import {
  APPLICATION_MODE,
  APPLICATION_STATE_KEY,
  PAGE_SNAPSHOT_KIND,
  PLACEMENT_COORDINATE_SPACE,
} from "./application-state-vocabulary.js";
import {
  tryNormalizeDurablePlacementCoordinateSpace,
} from "./map-locked-placement.js";

const STATE_KEY = APPLICATION_STATE_KEY;
const MODE = APPLICATION_MODE;
const LEGACY_PLACEMENT_MIGRATION_METHOD = "reconcileLegacyPlacement";

export async function readStartupDurableState({ host, reportHostError }) {
  try {
    return await host.durableStatePort?.readDurableState?.() ?? null;
  } catch (error) {
    reportHostError(host, error);
    return null;
  }
}

export async function hydrateStartupState({ host, durableState, reportHostError }) {
  const migrated = tryMigrateLegacyState({ host, durableState });
  if (migrated.status === "migrated") {
    await writeStartupRecovery({ host, durableState: migrated.durableState, reportHostError });
    return stateFromDurableState(migrated.durableState);
  }
  if (migrated.status === "recovered") {
    return stateFromDurableState(migrated.durableState);
  }
  const normalized = tryNormalizeStartupPlacementCoordinateSpace({ host, durableState });
  if (normalized.status === "normalized") {
    await writeStartupRecovery({ host, durableState: normalized.durableState, reportHostError });
    return stateFromDurableState(normalized.durableState);
  }
  try {
    return handleApplicationCommand({
      state: createInitialApplicationState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
        durableState,
      }),
    }).state;
  } catch (error) {
    if (error instanceof ApplicationBoundaryError) {
      await writeStartupRecovery({ host, durableState: null, reportHostError });
      return createInitialApplicationState();
    }
    throw error;
  }
}

function tryNormalizeStartupPlacementCoordinateSpace({ host, durableState }) {
  if (!hasStartupPlacementNormalizationCandidate(durableState)) {
    return {
      status: "none",
    };
  }
  return tryNormalizeDurablePlacementCoordinateSpace({
    durableState,
    snapshot: host.pageSnapshotPort?.readSnapshot?.(),
  });
}

function hasStartupPlacementNormalizationCandidate(durableState) {
  const current = durableState?.[STATE_KEY.session];
  const placement = current?.[STATE_KEY.placement];
  return Boolean(
    current
      && current[STATE_KEY.mode] === MODE.align
      && placement
      && placement.coordinateSpace !== PLACEMENT_COORDINATE_SPACE.mapWorld,
  );
}

function tryMigrateLegacyState({ host, durableState }) {
  const current = durableState?.[STATE_KEY.session];
  const legacyPlace = current?.[STATE_KEY.placement];
  if (!current || !isLegacyMapCenteredPlace(legacyPlace)) {
    return {
      status: "none",
    };
  }
  const snapshot = host.pageSnapshotPort?.readSnapshot?.();
  if (snapshot?.kind !== PAGE_SNAPSHOT_KIND.supportedMapPage) {
    return {
      status: "recovered",
      durableState: withoutKey(durableState, [STATE_KEY.session, STATE_KEY.placement]),
    };
  }
  const migrate = host.legacyPlacementMigrationPort?.[LEGACY_PLACEMENT_MIGRATION_METHOD];
  const nextPlace = migrate?.({
    [STATE_KEY.referenceImage]: current[STATE_KEY.referenceImage],
    legacyPlacement: legacyPlace,
    pageSnapshot: snapshot,
  });
  if (!nextPlace) {
    return {
      status: "recovered",
      durableState: withoutKey(durableState, [STATE_KEY.session, STATE_KEY.placement]),
    };
  }
  return {
    status: "migrated",
    durableState: {
      [STATE_KEY.session]: {
        ...current,
        [STATE_KEY.placement]: nextPlace,
      },
    },
  };
}

function isLegacyMapCenteredPlace(value) {
  return Boolean(value?.centerMapLatLon);
}

function withoutKey(durableState, [outerKey, innerKey]) {
  const current = durableState?.[outerKey];
  if (!current) {
    return durableState;
  }
  const nextInner = {};
  for (const [key, value] of Object.entries(current)) {
    if (key !== innerKey) {
      nextInner[key] = value;
    }
  }
  return {
    [outerKey]: nextInner,
  };
}

async function writeStartupRecovery({ host, durableState, reportHostError }) {
  try {
    await host.durableStatePort?.writeDurableState?.(durableState);
  } catch (error) {
    reportHostError(host, error);
  }
}

function stateFromDurableState(durableState) {
  if (durableState === null) {
    return createInitialApplicationState();
  }
  return {
    [STATE_KEY.session]: durableState[STATE_KEY.session],
  };
}
