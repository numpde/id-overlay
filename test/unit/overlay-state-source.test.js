import test from "node:test";
import assert from "node:assert/strict";

import { createOverlayStateSource } from "../../src/content/overlay/state-source.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import {
  SESSION_MODE,
  createEmptySession,
} from "../../src/core/session.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { IMAGE } from "../helpers/session-fixtures.js";

const SNAPSHOT = Object.freeze({
  mountElement: { id: "mount-1" },
  viewportRect: { left: 100, top: 200, width: 800, height: 400 },
  localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
  mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
  surfaceMotion: {
    transformCss: "matrix(1, 0, 0, 1, 0, 0)",
    transformOriginCss: "0px 0px",
  },
});

test("overlay state source exposes one consistent view/input projection", () => {
  const machineHost = createMachineHostHarness({
    state: createOverlayMachineState(),
  });
  const source = createOverlayStateSource({
    pageObservation: createPageObservationHarness({ snapshot: SNAPSHOT }),
    pageProjection: createPageProjectionHarness(),
    machineHost,
    overlayInteractions: createOverlayInteractionsHarness({
      runtime: machineHost.getState().runtime,
    }),
  });

  const viewModel = source.getOverlayViewModel();
  const inputContext = source.getOverlayInputContext();

  assert.equal(source.getMountElement(), SNAPSHOT.mountElement);
  assert.equal(inputContext.machineState, machineHost.getState());
  assert.equal(inputContext.runtime, source.getRuntimeState());
  assert.deepEqual(inputContext.viewModel, viewModel);
});

test("overlay state source updates page/runtime facts and reports change hooks", () => {
  const changes = [];
  const runtimeChanges = [];
  const machineHost = createMachineHostHarness({
    state: createOverlayMachineState(),
  });
  const pageObservation = createPageObservationHarness({ snapshot: SNAPSHOT });
  const overlayInteractions = createOverlayInteractionsHarness({
    runtime: machineHost.getState().runtime,
  });
  const source = createOverlayStateSource({
    pageObservation,
    pageProjection: createPageProjectionHarness(),
    machineHost,
    overlayInteractions,
    onChange: () => changes.push("change"),
    onRuntimeChange: (runtime) => runtimeChanges.push(runtime),
  });

  const nextSnapshot = {
    ...SNAPSHOT,
    mountElement: { id: "mount-2" },
    localViewportRect: { left: 5, top: 6, width: 700, height: 300 },
  };
  const nextRuntime = {
    ...machineHost.getState().runtime,
    pointer: { screenPx: { x: 12, y: 34 } },
  };
  pageObservation.emit(nextSnapshot);
  overlayInteractions.emitRuntime(nextRuntime);
  machineHost.emit();

  assert.equal(source.getSnapshot(), nextSnapshot);
  assert.equal(source.getMountElement(), nextSnapshot.mountElement);
  assert.equal(source.getRuntimeState(), nextRuntime);
  assert.deepEqual(changes, ["change", "change", "change"]);
  assert.deepEqual(runtimeChanges, [nextRuntime]);
});

test("overlay state source suppresses eager subscription notifications during construction", () => {
  const machineHost = createMachineHostHarness({
    state: createOverlayMachineState(),
    emitOnSubscribe: true,
  });
  const overlayInteractions = createOverlayInteractionsHarness({
    runtime: machineHost.getState().runtime,
    emitOnSubscribe: true,
  });
  const changes = [];
  const runtimeChanges = [];

  createOverlayStateSource({
    pageObservation: createPageObservationHarness({ snapshot: SNAPSHOT }),
    pageProjection: createPageProjectionHarness(),
    machineHost,
    overlayInteractions,
    onChange: () => changes.push("change"),
    onRuntimeChange: (runtime) => runtimeChanges.push(runtime),
  });

  assert.deepEqual(changes, []);
  assert.deepEqual(runtimeChanges, []);
});

test("overlay state source destroys all subscriptions", () => {
  const machineHost = createMachineHostHarness({
    state: createOverlayMachineState(),
  });
  const pageObservation = createPageObservationHarness({ snapshot: SNAPSHOT });
  const overlayInteractions = createOverlayInteractionsHarness({
    runtime: machineHost.getState().runtime,
  });
  const changes = [];
  const source = createOverlayStateSource({
    pageObservation,
    pageProjection: createPageProjectionHarness(),
    machineHost,
    overlayInteractions,
    onChange: () => changes.push("change"),
  });

  source.destroy();
  pageObservation.emit(SNAPSHOT);
  overlayInteractions.emitRuntime(machineHost.getState().runtime);
  machineHost.emit();

  assert.deepEqual(changes, []);
  assert.equal(machineHost.subscriberCount(), 0);
  assert.equal(pageObservation.subscriberCount(), 0);
  assert.equal(overlayInteractions.subscriberCount(), 0);
});

function createOverlayMachineState() {
  return createInitialMachineState({
    session: {
      ...createEmptySession({
        mode: SESSION_MODE.ALIGN,
        image: IMAGE,
        opacity: 0.6,
      }),
      placement: createPlacementTransform({
        image: IMAGE,
        centerMapLatLon: SNAPSHOT.mapView.center,
        scale: 1,
        rotationRad: 0,
        zoom: SNAPSHOT.mapView.zoom,
      }),
    },
  });
}

function createMachineHostHarness({ state, emitOnSubscribe = false }) {
  const subscribers = new Set();
  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      subscribers.add(listener);
      if (emitOnSubscribe) {
        listener(state);
      }
      return () => {
        subscribers.delete(listener);
      };
    },
    emit() {
      for (const listener of subscribers) {
        listener(state);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  };
}

function createPageObservationHarness({ snapshot }) {
  const subscribers = new Set();
  let currentSnapshot = snapshot;
  return {
    getSnapshot() {
      return currentSnapshot;
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    emit(nextSnapshot) {
      currentSnapshot = nextSnapshot;
      for (const listener of subscribers) {
        listener(nextSnapshot);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  };
}

function createOverlayInteractionsHarness({ runtime, emitOnSubscribe = false }) {
  const subscribers = new Set();
  let currentRuntime = runtime;
  return {
    getRuntimeState() {
      return currentRuntime;
    },
    subscribeRuntime(listener) {
      subscribers.add(listener);
      if (emitOnSubscribe) {
        listener(currentRuntime);
      }
      return () => {
        subscribers.delete(listener);
      };
    },
    emitRuntime(nextRuntime) {
      currentRuntime = nextRuntime;
      for (const listener of subscribers) {
        listener(nextRuntime);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  };
}

function createPageProjectionHarness() {
  return {
    mapToOverlayLayerScreen({ lat, lon }) {
      return { x: lon, y: lat };
    },
  };
}
