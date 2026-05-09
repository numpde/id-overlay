import test from "node:test";
import assert from "node:assert/strict";

import { MACHINE_MODE } from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { reconcilePageContext } from "../../src/core/machine/page-context.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { IMAGE } from "../helpers/session-fixtures.js";

const LEGACY_PLACEMENT = Object.freeze({
  centerMapLatLon: Object.freeze({ lat: 1, lon: 2 }),
  scale: 1.25,
  rotationRad: 0.5,
});

const PAGE_CONTEXT = Object.freeze({
  mapView: Object.freeze({
    center: Object.freeze({ lat: 0, lon: 0 }),
    zoom: 17,
  }),
});

test("page context reconciles legacy map-centered placement after durable hydration", () => {
  const state = createInitialMachineState({
    session: {
      mode: MACHINE_MODE.ALIGN,
      image: IMAGE,
      placement: null,
    },
  });

  const result = reconcilePageContext(state, {
    persistedSession: {
      image: IMAGE,
      placement: LEGACY_PLACEMENT,
    },
    pageContext: PAGE_CONTEXT,
  });

  assert.deepEqual(result.state.session.placement, createPlacementTransform({
    image: result.state.session.image,
    centerMapLatLon: LEGACY_PLACEMENT.centerMapLatLon,
    scale: LEGACY_PLACEMENT.scale,
    rotationRad: LEGACY_PLACEMENT.rotationRad,
    zoom: PAGE_CONTEXT.mapView.zoom,
  }));
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
});

test("page context reconciliation does not replace canonical placement", () => {
  const placement = createPlacementTransform({
    image: IMAGE,
    centerMapLatLon: LEGACY_PLACEMENT.centerMapLatLon,
    scale: 1,
    rotationRad: 0,
    zoom: PAGE_CONTEXT.mapView.zoom,
  });
  const state = createInitialMachineState({
    session: {
      image: IMAGE,
      placement,
    },
  });

  const result = reconcilePageContext(state, {
    persistedSession: {
      image: IMAGE,
      placement: LEGACY_PLACEMENT,
    },
    pageContext: PAGE_CONTEXT,
  });

  assert.equal(result.state, state);
});

test("machine host ingests page context once and persists the reconciled session", () => {
  const saves = [];
  const host = createMachineHost({
    persistedSession: {
      mode: MACHINE_MODE.ALIGN,
      image: IMAGE,
      placement: LEGACY_PLACEMENT,
    },
    savePersistedSession: (session) => saves.push(session),
  });

  assert.equal(host.getState().session.placement, null);

  host.ingestPageContext(PAGE_CONTEXT);

  assert.deepEqual(host.getState().session.placement, createPlacementTransform({
    image: host.getState().session.image,
    centerMapLatLon: LEGACY_PLACEMENT.centerMapLatLon,
    scale: LEGACY_PLACEMENT.scale,
    rotationRad: LEGACY_PLACEMENT.rotationRad,
    zoom: PAGE_CONTEXT.mapView.zoom,
  }));
  assert.equal(saves.length, 1);

  host.ingestPageContext(PAGE_CONTEXT);
  assert.equal(saves.length, 1);
});

test("machine host keeps unresolved legacy placement until page context is usable", () => {
  const host = createMachineHost({
    persistedSession: {
      mode: MACHINE_MODE.ALIGN,
      image: IMAGE,
      placement: LEGACY_PLACEMENT,
    },
  });

  host.ingestPageContext({ mapView: { zoom: Number.NaN } });
  assert.equal(host.getState().session.placement, null);

  host.ingestPageContext(PAGE_CONTEXT);
  assert.deepEqual(host.getState().session.placement, createPlacementTransform({
    image: host.getState().session.image,
    centerMapLatLon: LEGACY_PLACEMENT.centerMapLatLon,
    scale: LEGACY_PLACEMENT.scale,
    rotationRad: LEGACY_PLACEMENT.rotationRad,
    zoom: PAGE_CONTEXT.mapView.zoom,
  }));
});
