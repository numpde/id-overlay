import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: key choices are UI vocabulary, but the missing piece is architectural:
// bootstrap does not yet bind keyboard facts into the interaction runtime. Keep
// this quarantined until keyboard input is composed through projection before
// any application pin/pass-through command is emitted.
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

// Class-c: temporary pass-through is runtime interaction posture, not durable
// state. This should become class-b after the shell owns keyboard subscription
// lifetime and maps Space press/release facts through the runtime boundary.
test("keyboard Space toggles temporary pass-through without durable writes", async () => {
  const keyboard = createKeyboardHarness();
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    keyboardInputPort: keyboard.port,
  });

  await bootstrapBrowserExtension(host);
  await keyboard.emit({
    kind: "temporary-pass-through-pressed",
  });
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    reason: "temporary-pass-through",
  });

  await keyboard.emit({
    kind: "temporary-pass-through-released",
  });
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });
  assert.deepEqual(storage.writes, []);
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
