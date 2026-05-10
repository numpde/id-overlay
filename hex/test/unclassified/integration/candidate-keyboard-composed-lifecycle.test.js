import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createDurableStorageHarness,
  durableImageState,
  normalizedReferenceImage,
} from "./candidate-browser-harness.js";

// Unclassified: key choices are provisional, but the boundary is not. Keyboard
// events must be adapter facts that are bound/disposed by the shell and resolved
// through projection before application commands mutate pins or pass-through.
test("candidate: keyboard pin shortcut is bound by the shell and resolved through projection", async () => {
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

// Unclassified: temporary pass-through is interaction posture, not durable
// state. Space press/release should visibly switch overlay input without
// persisting or modifying the image session.
test("candidate: keyboard Space toggles temporary pass-through without durable writes", async () => {
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
