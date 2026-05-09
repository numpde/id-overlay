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
import { assertApplicationBoundaryError } from "./application-boundary-assertions.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";
import { referenceImageSessionState } from "./reference-image-fixtures.js";

// Hydration is the startup seam: durable plain data enters the application and
// becomes canonical state. How that durable data was kept is an adapter concern.

test("application command vocabulary includes explicit hydration", () => {
  assert.equal(APPLICATION_COMMAND_KIND.HYDRATE, "hydrate");

  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "hydrate",
    durableState: null,
  });
});

// Null is the caller's plain-data way to say "no durable state exists". The
// application should turn that into canonical empty state without asking the
// caller to do more work.
test("hydrating missing durable state returns empty application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: {},
    effects: [],
  });
});

// Empty durable data is the explicit no-session durable shape.
test("hydrating empty durable state returns empty application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {},
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: {},
    effects: [],
  });
});

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

// Hydration input must still be plain data before the application can decide
// whether the durable shape is supported. Rich values here mean the caller
// leaked runtime data inward.
test("hydration rejects non-data durable state", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: new Map(),
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE,
  );
});
