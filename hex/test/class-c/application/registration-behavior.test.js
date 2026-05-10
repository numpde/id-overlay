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
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  referenceImageDurableState,
  referenceImageLoadedState,
  solvedPlacement,
  twoPins,
} from "./reference-image-fixtures.js";

// Class-c: pin toggling was promoted as core Align-mode behavior. The remaining
// test covers Trace auto-fit policy. Placement preservation during pin edits was
// promoted because explicit overlay placement must survive registration edits.

// Class-c: auto-fitting on Trace switch is user-visible and likely right. The
// command carries solvedPlacement on purpose: the application should decide
// whether to accept a solve, not know page projection mechanics itself. The
// exact solved-placement payload and fit notice remain unsettled product shape.
test("switching to Trace with two pins fits the overlay from registration", () => {
  const state = referenceImageLoadedState({
    mode: "align",
    pins: twoPins(),
  });
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "trace",
    solvedPlacement: solvedPlacement(),
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      mode: "trace",
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
        mode: "trace",
        placement: solvedPlacement(),
        pins: twoPins(),
        solved: solvedPlacement(),
      })),
    ],
  });

  assert.equal(selectApplicationView(result.state).mode, "trace");
});
