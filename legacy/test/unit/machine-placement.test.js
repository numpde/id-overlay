import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "../../src/core/machine/events.js";
import {
  applyPlacement,
  beginPlacementEdit,
  createHost,
  createLoadedHost,
  MOVED_PLACEMENT,
  PLACEMENT,
  previewPlacementEdit,
  state,
} from "../helpers/machine-scenarios.js";

test("one-shot placement edits commit placement and semantic history metadata", () => {
  const host = createLoadedHost();

  const moved = applyPlacement(host);
  assert.deepEqual(moved.state.session.placement, MOVED_PLACEMENT);
  assert.equal(moved.state.runtime.placementEdit, null);
  assert.equal(moved.historyRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(moved.historyRecord.undoLabel, "Undo move overlay");

  const rotatedPlacement = { ...MOVED_PLACEMENT, a: 0.5, b: 0.5, rotationRad: Math.PI / 4 };
  const rotate = applyPlacement(host, {
    editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
    renderedPlacement: MOVED_PLACEMENT,
    placement: rotatedPlacement,
  });
  assert.deepEqual(rotate.state.session.placement, rotatedPlacement);
  assert.equal(rotate.state.runtime.placementEdit, null);
  assert.equal(rotate.historyRecord.kind, MACHINE_HISTORY_KIND.ROTATE_OVERLAY);
  assert.equal(rotate.historyRecord.undoLabel, "Undo rotate overlay");

  const scaledPlacement = { ...rotatedPlacement, a: 2, b: 0, scale: 2, rotationRad: 0 };
  const scale = applyPlacement(host, {
    editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
    renderedPlacement: rotatedPlacement,
    placement: scaledPlacement,
  });
  assert.deepEqual(scale.state.session.placement, scaledPlacement);
  assert.equal(scale.historyRecord.kind, MACHINE_HISTORY_KIND.SCALE_OVERLAY);
  assert.equal(scale.historyRecord.undoLabel, "Undo scale overlay");
});

test("placement edit preview is transient machine runtime, not durable session state", () => {
  const host = createLoadedHost();
  const beforeHistoryLength = state(host).history.past.length;

  const begin = beginPlacementEdit(host);
  assert.equal(begin.historyRecord, null);
  assert.deepEqual(begin.state.session.placement, PLACEMENT);
  assert.deepEqual(begin.state.runtime.placementEdit.beforePlacement, PLACEMENT);
  assert.deepEqual(begin.state.runtime.placementEdit.previewPlacement, PLACEMENT);

  const preview = previewPlacementEdit(host);
  assert.equal(preview.historyRecord, null);
  assert.deepEqual(preview.state.session.placement, PLACEMENT);
  assert.deepEqual(preview.state.runtime.placementEdit.previewPlacement, MOVED_PLACEMENT);
  assert.equal(preview.state.history.past.length, beforeHistoryLength);
});

test("placement edit commit records one semantic history entry and clears the preview", () => {
  const host = createLoadedHost();
  beginPlacementEdit(host);
  previewPlacementEdit(host);

  const commit = host.commitOverlayMove();

  assert.deepEqual(commit.state.session.placement, MOVED_PLACEMENT);
  assert.equal(commit.state.runtime.placementEdit, null);
  assert.equal(commit.historyRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(commit.state.history.past.at(-1).kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);

  const undo = host.activateUndo();
  assert.deepEqual(undo.state.session.placement, PLACEMENT);
  assert.equal(undo.state.runtime.placementEdit, null);

  const redo = host.activateRedo();
  assert.deepEqual(redo.state.session.placement, MOVED_PLACEMENT);
  assert.equal(redo.state.runtime.placementEdit, null);
});

test("unchanged placement edit commit only clears transient runtime", () => {
  const host = createLoadedHost();
  beginPlacementEdit(host);

  const commit = host.commitOverlayMove();

  assert.deepEqual(commit.state.session.placement, PLACEMENT);
  assert.equal(commit.state.runtime.placementEdit, null);
  assert.equal(commit.historyRecord, null);
});

test("interrupted placement edit drops preview without changing session", () => {
  const host = createLoadedHost();
  beginPlacementEdit(host);
  previewPlacementEdit(host);

  const interrupted = host.selectMode(MACHINE_MODE.TRACE);

  assert.deepEqual(interrupted.state.session.placement, PLACEMENT);
  assert.equal(interrupted.state.runtime.placementEdit, null);
  assert.equal(interrupted.historyRecord, null);
});

test("placement edit lifecycle is invalid outside Align overlay editing", () => {
  const noImageHost = createHost();
  let result = beginPlacementEdit(noImageHost);
  assert.deepEqual(result.state, state(noImageHost));

  const traceHost = createLoadedHost();
  traceHost.selectMode(MACHINE_MODE.TRACE);
  const before = state(traceHost);
  result = applyPlacement(traceHost, {
    editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
  });

  assert.deepEqual(result.state, before);
  assert.equal(result.historyRecord, null);
});
