import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  assertApplicationBoundaryError,
} from "../../class-b/application/application-boundary-assertions.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  firstPin,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: unsupported durable data is not a product outcome. It is a
// boundary contract failure until a migration/versioning policy exists.
test("hydration rejects unsupported durable reference-image data", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {
      session: {
        mode: "align",
        futureField: true,
      },
    },
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: createInitialApplicationState(),
      command,
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
  );
});

// Unclassified: status copy is product behavior when it describes visible app
// state. Exact wording remains proposal-level until the UI model settles.
test("application view describes concrete user-visible status", () => {
  for (const { state, status } of [
    {
      state: referenceImageLoadedState(),
      status: "Loaded screenshot 640x480.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "cleared-pins",
          count: 1,
        },
      }),
      status: "Cleared 1 pin.",
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
        panelIntent: {
          kind: "confirm-clear-pins",
        },
      }),
      status: "Click Clear pins? again to remove 1 pin.",
    },
    {
      state: {
        notice: {
          kind: "reference-image-paste-empty",
        },
      },
      status: "Clipboard does not contain an image.",
    },
  ]) {
    assert.equal(selectApplicationView(state).status, status);
  }
});
