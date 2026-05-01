import { UI_EVENT_KIND } from "../core/ui-event-model.js";
import {
  PANEL_FEEDBACK_ACTION,
  describePanelActionPresentation,
} from "../core/presentation.js";
import {
  runUiLiveEffects,
} from "../core/ui-live-effect-runner.js";

export async function runPanelLiveEffects({
  previousUiState,
  nextUiState,
  effects,
  nextPanelActionState,
}, {
  logger,
  interactions,
  statusController,
  readPasteInput,
  dispatchCanonicalUiEvent,
  startPanelTimeout,
  cancelPanelTimeout,
}) {
  await runUiLiveEffects({
    previousUiState,
    nextUiState,
    effects,
  }, {
    requestPasteInput: async () => {
      logger.info("Paste requested");
      const image = await readPasteInput({
        sessionId: nextPanelActionState.sessionId,
      });
      if (image) {
        await dispatchCanonicalUiEvent({
          kind: UI_EVENT_KIND.PASTE_SUCCEEDED,
          image,
          placement: null,
        });
      }
    },
    clearPins: async () => {
      logger.info("Cleared pins from canonical UI effect");
      interactions.clearPins();
    },
    clearImage: async () => {
      logger.info("Cleared image from canonical destructive action");
      interactions.clearImage();
      statusController.showTransient(
        describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLEAR_IMAGE),
      );
    },
    undoSession: async () => {
      statusController.clearTransient();
      const historyDescriptor = interactions.undoSessionHistory();
      if (historyDescriptor) {
        statusController.showTransient(
          describePanelActionPresentation(PANEL_FEEDBACK_ACTION.UNDO, {
            historyLabel: historyDescriptor.label,
          }),
        );
      }
    },
    redoSession: async () => {
      statusController.clearTransient();
      const historyDescriptor = interactions.redoSessionHistory();
      if (historyDescriptor) {
        statusController.showTransient(
          describePanelActionPresentation(PANEL_FEEDBACK_ACTION.REDO, {
            historyLabel: historyDescriptor.label,
          }),
        );
      }
    },
    showPasteCancelledFeedback: async () => {
      logger.info("Cancelled paste capture");
      statusController.showTransient(
        describePanelActionPresentation(PANEL_FEEDBACK_ACTION.PASTE_CANCELLED),
      );
    },
    startPanelTimeout,
    cancelPanelTimeout,
    applyResolvedModeTransition: async (modeExecution) => {
      interactions.applyResolvedModeTransition(modeExecution);
    },
  });
}
