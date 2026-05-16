import {
  cancelReferenceImageInputEffect,
  loadReferenceImageInputIntent,
  requestReferenceImageInputEffect,
  scheduleClearPanelIntentEffect,
  scheduleClearStatusNoticeEffect,
} from "./effects.js";
import {
  clearReferenceImageWithHistory,
  isReplacementReferenceImageInput,
} from "./reference-image-commands.js";
import {
  clearRegistrationPins,
} from "./registration-commands.js";

export function activatePrimaryAction(state, { inertResult }) {
  if (state.referenceImageInput?.status === "awaiting-input") {
    const requestId = state.referenceImageInput.requestId;
    if (isReplacementReferenceImageInput(state)) {
      return {
        state: {
          session: state.session,
          ...historyState(state),
          notice: {
            kind: "reference-image-replacement-cancelled",
            requestId,
          },
        },
        effects: [
          cancelReferenceImageInputEffect(requestId),
          scheduleClearStatusNoticeEffect(requestId),
        ],
      };
    }
    return {
      state: {
        notice: {
          kind: "reference-image-input-cancelled",
          requestId,
        },
      },
      effects: [
        cancelReferenceImageInputEffect(requestId),
        scheduleClearStatusNoticeEffect(requestId),
      ],
    };
  }
  if (!state.session) {
    const requestId = 1;
    const intent = loadReferenceImageInputIntent();
    return {
      state: {
        referenceImageInput: {
          status: "awaiting-input",
          requestId,
          intent,
        },
      },
      effects: [requestReferenceImageInputEffect({ requestId, intent })],
    };
  }
  if (state.panelIntent?.kind === "confirm-clear-pins") {
    return clearRegistrationPins(state, { inertResult });
  }
  if (state.panelIntent?.kind === "confirm-clear-reference-image") {
    return clearReferenceImageWithHistory(state);
  }
  if (
    state.session.mode === "align"
      && (state.session.registration?.pins ?? []).length > 0
  ) {
    const requestId = 1;
    return {
      state: {
        session: state.session,
        panelIntent: {
          kind: "confirm-clear-pins",
          requestId,
        },
      },
      effects: [
        scheduleClearPanelIntentEffect({
          requestId,
          intentKind: "confirm-clear-pins",
        }),
      ],
    };
  }

  const requestId = 1;
  return {
    state: {
      session: state.session,
      panelIntent: {
        kind: "confirm-clear-reference-image",
        requestId,
      },
    },
    effects: [
      scheduleClearPanelIntentEffect({
        requestId,
        intentKind: "confirm-clear-reference-image",
      }),
    ],
  };
}

function historyState(state) {
  if (!state.history) {
    return {};
  }
  return {
    history: state.history,
  };
}
