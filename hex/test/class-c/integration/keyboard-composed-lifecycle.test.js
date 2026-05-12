import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: the user behavior is stable, but this test is over-coupled to
// proposed shell mechanics. A class-b version should say "press P while Align is
// active" and assert the visible/durable pin result, not name `keyboardInputPort`
// or `inputProjectionPort`.
test("keyboard pin shortcut is bound by the shell and resolved through projection", async () => {
  const keyboard = createKeyboardHarness();
  const projection = createProjectionHarness({
    projectedPin: {
      imagePx: {
        x: 320,
        y: 240,
      },
      mapLatLon: {
        lat: -1.23,
        lon: 36.84,
      },
      existingPinId: null,
    },
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    keyboardInputPort: keyboard.port,
    inputProjectionPort: projection.port,
  });

  await bootstrapBrowserExtension(host);
  await keyboard.emit({
    kind: "keyboard-pin-toggle-requested",
  });

  assert.equal(keyboard.bindCount, 1);
  assert.equal(projection.projectCount, 1);
  assert.deepEqual(host.runtime.getState().session.registration.pins, [{
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  }]);
});

function createBrowserHostHarness({
  durableStatePort,
  keyboardInputPort,
  inputProjectionPort = null,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    keyboardInputPort,
    inputProjectionPort,
    latestRender: null,
    runtime: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    startRuntime(runtime) {
      this.runtime = runtime;
      return runtime;
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}

function durableImageState({
  mode,
  referenceImage = normalizedReferenceImage(),
}) {
  return {
    session: {
      mode,
      referenceImage,
    },
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function createKeyboardHarness() {
  let listener = null;
  let bindCount = 0;
  return {
    get bindCount() {
      return bindCount;
    },
    port: {
      bindInput(nextListener) {
        bindCount += 1;
        listener = nextListener;
        return () => {};
      },
    },
    async emit(fact) {
      assert.equal(typeof listener, "function", "keyboard input was not bound");
      await listener(fact);
    },
  };
}

function createProjectionHarness({ projectedPin }) {
  let projectCount = 0;
  return {
    get projectCount() {
      return projectCount;
    },
    port: {
      projectCurrentPointerToRegistrationPin() {
        projectCount += 1;
        return projectedPin;
      },
    },
  };
}
