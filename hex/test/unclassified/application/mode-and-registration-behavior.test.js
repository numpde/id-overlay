import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  APPLICATION_MODE,
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
  solvedPlacement,
  twoPins,
} from "./user-behavior-fixtures.js";

// Unclassified: selecting Trace with enough pins causes a visible fit. This is
// not "mode restored by snapshot"; the semantic action changes the viewed map.
test("switching to Trace with two pins fits the overlay from registration", () => {
  const state = referenceImageLoadedState({
    mode: APPLICATION_MODE.ALIGN,
    pins: twoPins(),
  });
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: APPLICATION_MODE.TRACE,
    solvedPlacement: solvedPlacement(),
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      mode: APPLICATION_MODE.TRACE,
      placement: solvedPlacement(),
      pins: twoPins(),
      solved: solvedPlacement(),
      notice: {
        kind: "fit-reference-image-from-pins",
        pinCount: 2,
      },
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        mode: APPLICATION_MODE.TRACE,
        placement: solvedPlacement(),
        pins: twoPins(),
        solved: solvedPlacement(),
      })),
    ],
  });

  assert.equal(selectApplicationView(result.state).mode, APPLICATION_MODE.TRACE);
});
