import {
  applyPlacementRevision,
} from "./placement-history.js";
import {
  createHistoryEmptyNotice,
  createHistoryReplayedNotice,
  createViewFeedbackStatusNotice,
  withStatusNotice,
} from "./status-notice.js";
import { createInitialApplicationState } from "./state.js";
import { selectDurableApplicationState } from "./view-model.js";

export function replayHistory(state, direction) {
  const history = state.history ?? {};
  const record = direction === "undo"
    ? history.past?.at(-1)
    : history.future?.at(-1);
  if (!record) {
    return {
      state: withStatusNotice(state, createHistoryEmptyNotice(direction)),
      effects: [],
    };
  }

  const nextHistory = direction === "undo"
    ? {
        past: history.past.slice(0, -1),
        future: [...(history.future ?? []), record],
      }
    : {
        past: [...(history.past ?? []), record],
        future: history.future.slice(0, -1),
      };
  const durableState = applyHistoryRecord(
    state,
    record,
    direction === "undo" ? "before" : "after",
  );
  return {
    state: {
      ...stateFromDurableState(durableState),
      history: nextHistory,
    },
    effects: [persistDurableStateEffect(durableState)],
    viewFeedback: createViewFeedbackStatusNotice(
      createHistoryReplayedNotice({ record, direction }),
    ),
  };
}

export function pushHistory(history, record) {
  return {
    past: [...(history?.past ?? []), record],
    future: [],
  };
}

export function withoutRedoHistory(history) {
  if (!history) {
    return {};
  }
  return {
    history: {
      past: history.past ?? [],
      future: [],
    },
  };
}

function applyHistoryRecord(state, record, side) {
  if (record.kind === "overlay-placement-edit") {
    return applyPlacementHistoryRevision(state, record[side]);
  }
  return record[side];
}

function applyPlacementHistoryRevision(state, revision) {
  const durableState = selectDurableApplicationState(state);
  if (!durableState?.session) {
    return durableState;
  }
  return {
    session: applyPlacementRevision(durableState.session, revision),
  };
}

function stateFromDurableState(durableState) {
  if (durableState === null) {
    return createInitialApplicationState();
  }
  return {
    session: durableState.session,
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}
