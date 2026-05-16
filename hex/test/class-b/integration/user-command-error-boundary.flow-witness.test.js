import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: class-a owns which commands are boundary
// errors. The browser-shell contract is recovery posture: malformed UI/adapter
// commands are reported at the edge and must not poison the runtime's ability to
// accept the next valid command.
test("user-command boundary errors are reported without killing later renders", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "user-command boundary errors are reported without killing later renders",
  });
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState({
        mode: "align",
      }),
    }).port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "unknown-user-command",
  });
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.deepEqual(host.reportedErrors.map((error) => error.code), [
    "unknown-application-command",
  ]);
  assert.equal(host.latestRender.view.mode, "trace");
  trace.edge(flowEdge("source.rendered-command", "command.user-command", {
    phase: "malformed-command",
    provider: "rendered-ui",
  }));
  trace.edge(flowEdge("command.user-command", "sink.runtime-boundary-error", {
    phase: "malformed-command",
    terminal: "boundary-rejection",
  }));
  trace.edge(flowEdge("source.rendered-command", "command.select-mode", {
    phase: "later-valid-command",
    provider: "rendered-ui",
  }));
  trace.edge(flowEdge("command.select-mode", "sink.render", {
    phase: "later-valid-command",
    terminal: "render-result",
  }));
});

function createBrowserHostHarness({ durableStatePort }) {
  const reportedErrors = [];
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    reportedErrors,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    reportRuntimeError(error) {
      reportedErrors.push(error);
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  return {
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState() {},
    },
  };
}

function durableImageState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
