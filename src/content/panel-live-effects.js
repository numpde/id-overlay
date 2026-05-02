import { UI_EVENT_KIND } from "../core/ui-event-model.js";
import { PANEL_FEEDBACK_ACTION } from "../core/presentation.js";
import { runUiLiveEffects } from "../core/ui-live-effect-runner.js";

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
      // Final semantic-history shape: paste input is a legitimate external
      // effect, but placement and load-image history should be authored by the
      // PASTE_SUCCEEDED transition, not by the effect runner or interactions.
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
      // Final semantic-history shape: this handler should disappear once
      // clear-pins is committed by the state-machine transition itself. The
      // panel should not ask interactions to perform a second durable mutation.
      logger.info("Cleared pins from canonical UI effect");
      interactions.clearPins();
    },
    clearImage: async () => {
      // Final semantic-history shape: clear-image should be the transition's
      // durable state change plus history record. This handler should only run
      // non-state side effects, or disappear if no side effect remains.
      logger.info("Cleared image from canonical destructive action");
      interactions.clearImage();
      statusController.showPanelFeedback(PANEL_FEEDBACK_ACTION.CLEAR_IMAGE);
    },
    undoSession: async () => {
      // Final semantic-history shape: undo should be resolved inside the
      // canonical transition, including feedback metadata. This imperative
      // bridge to interactions.undoSessionHistory() should disappear.
      statusController.clearTransient();
      const historyDescriptor = interactions.undoSessionHistory();
      if (historyDescriptor) {
        statusController.showPanelFeedback(PANEL_FEEDBACK_ACTION.UNDO, {
          historyDescriptor,
        });
      }
    },
    redoSession: async () => {
      // Final semantic-history shape: redo should replay the stored semantic
      // transition through the state machine, not leave this layer to call the
      // snapshot-history store path.
      statusController.clearTransient();
      const historyDescriptor = interactions.redoSessionHistory();
      if (historyDescriptor) {
        statusController.showPanelFeedback(PANEL_FEEDBACK_ACTION.REDO, {
          historyDescriptor,
        });
      }
    },
    showPasteCancelledFeedback: async () => {
      logger.info("Cancelled paste capture");
      statusController.showPanelFeedback(PANEL_FEEDBACK_ACTION.PASTE_CANCELLED);
    },
    startPanelTimeout,
    cancelPanelTimeout,
    applyResolvedModeTransition: async (modeExecution) => {
      // Final semantic-history shape: mode execution should not be inferred by
      // the live-effect runner. The state-machine transition should already
      // have authored mode and any fit-overlay history.
      interactions.applyResolvedModeTransition(modeExecution);
    },
  });
}
