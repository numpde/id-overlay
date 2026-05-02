import {
  MACHINE_EVENT_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./machine/events.js";

export function createMachineBackedStateStore(machineHost) {
  let batchDepth = 0;
  let placementBatch = null;

  function getState() {
    return projectMachineSession(machineHost.getState());
  }

  function subscribe(listener, options) {
    return machineHost.subscribe((state) => {
      listener(projectMachineSession(state));
    }, options);
  }

  function setMode(mode) {
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.SELECT_MODE,
      mode,
    });
    return getState();
  }

  function setOpacity(opacity) {
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity,
    });
    return getState();
  }

  function loadImageSession(image, placement) {
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.LOAD_IMAGE,
      image,
      placement,
    });
    return getState();
  }

  function setPlacement(placement, options = {}) {
    if (batchDepth > 0) {
      placementBatch.pendingPlacement = placement;
      placementBatch.editKind ??= placementEditKindFromDescriptor(options.historyDescriptor);
      machineHost.dispatch({
        type: MACHINE_EVENT_KIND.SYNC_PLACEMENT,
        placement,
      });
      return getState();
    }

    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.SET_PLACEMENT,
      placement,
      editKind: placementEditKindFromDescriptor(options.historyDescriptor),
    });
    return getState();
  }

  function syncPlacement(placement) {
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.SYNC_PLACEMENT,
      placement,
    });
    return getState();
  }

  function addPin({ imagePx, mapLatLon }) {
    const previousPins = getState().registration.pins;
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.ADD_PIN,
      imagePx,
      mapLatLon,
    });
    return findAddedPin(previousPins, getState().registration.pins);
  }

  function removePin(pinId) {
    const previousPins = getState().registration.pins;
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.REMOVE_PIN,
      id: pinId,
    });
    return previousPins.length !== getState().registration.pins.length;
  }

  function clearPins() {
    const previousPins = getState().registration.pins;
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.CLEAR_PINS,
    });
    return previousPins.length !== getState().registration.pins.length;
  }

  function setSolvedTransform(solvedTransform) {
    const registration = getState().registration;
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
      registration: {
        ...registration,
        solvedTransform,
        dirty: false,
      },
    });
    return getState();
  }

  function invalidateSolvedTransform() {
    const registration = getState().registration;
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
      registration: {
        ...registration,
        solvedTransform: null,
        dirty: registration.pins.length > 0,
      },
    });
    return getState();
  }

  function clearImage() {
    machineHost.dispatch({
      type: MACHINE_EVENT_KIND.CLEAR_IMAGE,
    });
    return getState();
  }

  function canUndo() {
    return Boolean(peekUndoRecord());
  }

  function canRedo() {
    return Boolean(peekRedoRecord());
  }

  function getUndoDescriptor() {
    return historyDescriptorFromRecord(peekUndoRecord(), "undoLabel");
  }

  function getRedoDescriptor() {
    return historyDescriptorFromRecord(peekRedoRecord(), "redoLabel");
  }

  function beginHistoryBatch(descriptor = null) {
    batchDepth += 1;
    if (batchDepth === 1) {
      placementBatch = {
        basePlacement: getState().placement,
        pendingPlacement: null,
        editKind: placementEditKindFromDescriptor(descriptor),
      };
    }
  }

  function endHistoryBatch() {
    if (batchDepth === 0) {
      return false;
    }

    batchDepth -= 1;
    if (batchDepth > 0) {
      return false;
    }

    const batch = placementBatch;
    placementBatch = null;
    if (
      !batch?.pendingPlacement ||
      areEqualPlacements(batch.basePlacement, batch.pendingPlacement)
    ) {
      return false;
    }

    const result = machineHost.dispatch({
      type: MACHINE_EVENT_KIND.SET_PLACEMENT,
      placement: batch.pendingPlacement,
      previousPlacement: batch.basePlacement,
      editKind: batch.editKind,
    });
    return Boolean(result.historyRecord);
  }

  function undo() {
    const result = machineHost.dispatch({
      type: MACHINE_EVENT_KIND.UNDO,
    });
    return historyDescriptorFromRecord(result.consumedHistoryRecord, "undoLabel");
  }

  function redo() {
    const result = machineHost.dispatch({
      type: MACHINE_EVENT_KIND.REDO,
    });
    return historyDescriptorFromRecord(result.consumedHistoryRecord, "redoLabel");
  }

  function peekUndoRecord() {
    return machineHost.getState().history.past.at(-1) ?? null;
  }

  function peekRedoRecord() {
    return machineHost.getState().history.future[0] ?? null;
  }

  return {
    getState,
    subscribe,
    setMode,
    setOpacity,
    loadImageSession,
    setPlacement,
    syncPlacement,
    addPin,
    removePin,
    clearPins,
    setSolvedTransform,
    invalidateSolvedTransform,
    clearImage,
    canUndo,
    canRedo,
    getUndoDescriptor,
    getRedoDescriptor,
    beginHistoryBatch,
    endHistoryBatch,
    undo,
    redo,
  };
}

function projectMachineSession(machineState) {
  return machineState.session;
}

function findAddedPin(previousPins, nextPins) {
  const previousIds = new Set(previousPins.map((pin) => pin.id));
  return nextPins.find((pin) => !previousIds.has(pin.id)) ?? null;
}

function historyDescriptorFromRecord(record, labelKey) {
  if (!record) {
    return null;
  }
  return {
    kind: record.kind,
    label: record[labelKey] ?? record.label ?? null,
  };
}

function placementEditKindFromDescriptor(descriptor) {
  if (descriptor?.kind === "rotate-overlay") {
    return MACHINE_PLACEMENT_EDIT_KIND.ROTATE;
  }
  if (descriptor?.kind === "scale-overlay") {
    return MACHINE_PLACEMENT_EDIT_KIND.SCALE;
  }
  return MACHINE_PLACEMENT_EDIT_KIND.MOVE;
}

function areEqualPlacements(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
