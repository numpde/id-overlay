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

// Class-b, not class-a: this is a migration-policy guard. The exact future
// versioning scheme is not settled, but silently accepting unknown non-empty
// durable fields would choose an implicit data-loss policy.
test("hydration rejects unknown top-level durable fields", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {
      futureField: true,
      nested: {
        value: 1,
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

// Class-b, not class-a: exact durable session schema may still grow, but plain
// data is not automatically supported durable data. Hydration must reject
// impossible reference-image geometry instead of constructing an unusable
// session and letting invalid product state leak forward.
test("hydration rejects malformed durable reference-image session", () => {
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
    () => handleApplicationCommand({
      state: createInitialApplicationState(),
      command,
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
  );
});
