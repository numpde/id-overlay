import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";
import {
  isLiveMapSnapshot,
} from "./map-locked-placement.js";

const FIELD = Object.freeze({
  referenceImage: "referenceImage",
  placement: "placement",
});

export function createBrowserEffectHandlers({
  host,
  dispatchApplicationCommand,
  reportHostError,
}) {
  return {
    "persist-durable-state": async (effect) => {
      try {
        await host.durableStatePort?.writeDurableState(effect.durableState);
      } catch (error) {
        reportHostError(host, error);
      }
      return null;
    },
    "request-reference-image-input": async (effect) => {
      host.referenceImageInputPort?.startReferenceImageInput?.({
        requestId: effect.requestId,
        intent: effect.intent,
        reportOutcome: async (outcome) => {
          const nextOutcome = withInitialPlacement({
            host,
            intent: effect.intent,
            outcome,
          });
          await dispatchApplicationCommand(createApplicationCommand(
            APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
            {
              requestId: effect.requestId,
              outcome: nextOutcome,
            },
          ));
        },
      });
      return null;
    },
    "cancel-reference-image-input": async (effect) => {
      host.referenceImageInputPort?.cancelReferenceImageInput?.({
        requestId: effect.requestId,
      });
      return null;
    },
    "schedule-application-command": async (effect) => {
      host.timerPort?.scheduleApplicationCommand?.({
        scheduleId: effect.scheduleId,
        delayMs: effect.delayMs,
        command: effect.command,
        dispatchApplicationCommand,
      });
      return null;
    },
  };
}

function withInitialPlacement({ host, intent, outcome }) {
  if (
    intent?.kind !== "load-reference-image"
      || outcome?.kind !== "accepted"
      || outcome[FIELD.placement] !== undefined
  ) {
    return outcome;
  }
  const pageSnapshot = host.pageSnapshotPort?.readSnapshot?.();
  if (!isLiveMapSnapshot(pageSnapshot)) {
    return outcome;
  }
  const placement = host.initialReferencePlacementPort?.createInitialReferencePlacement?.({
    [FIELD.referenceImage]: outcome[FIELD.referenceImage],
    pageSnapshot,
  });
  if (!placement) {
    return outcome;
  }
  return {
    ...outcome,
    [FIELD.placement]: placement,
  };
}
