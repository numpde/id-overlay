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
} from "../../class-b/application/application-boundary-assertions.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import { referenceImageSessionState } from "./reference-image-fixtures.js";

// Class-c: durable reference-image session shape is useful pressure, but not
// settled enough to make the startup boundary depend on this exact schema yet.

// The first durable session shape must round-trip through hydration. Otherwise
// accepted paste would create state that a later application run cannot restore.
test("hydrating durable reference image session restores application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: referenceImageSessionState(),
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: referenceImageSessionState(),
    effects: [],
  });
});

// Unknown durable fields are not a migration problem yet; there is no durable
// vocabulary beyond the current session shape. Rejecting them avoids silently
// choosing a data-loss or forward-compatibility policy.
test("hydrating unknown durable fields rejects non-empty durable data", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {
      futureField: true,
      nested: {
        value: 1,
      },
    },
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state, command }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
  );
});

// Plain data can still be outside the declared durable schema. That is an
// unsupported durable shape, not a caller data-shape leak.
test("hydrating malformed durable session rejects unsupported durable state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {
      session: {
        mode: "align",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 0,
            height: 480,
          },
        },
      },
    },
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state, command }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
  );
});
