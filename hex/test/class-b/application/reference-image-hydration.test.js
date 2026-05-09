import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  assertApplicationBoundaryError,
} from "./application-boundary-assertions.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b: hydration restores the declared durable reference-image session. The
// boundary is stable; the exact durable schema is still application vocabulary.
test("hydration restores the declared durable reference-image session", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: referenceImageDurableState(),
  });

  assertApplicationResult(handleApplicationCommand({
    state: createInitialApplicationState(),
    command,
  }), {
    state: referenceImageLoadedState(),
    effects: [],
  });
});

// Class-b: unsupported durable data is not a product outcome. It is a boundary
// contract failure until a migration/versioning policy exists.
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
