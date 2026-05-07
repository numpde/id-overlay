import test from "node:test";
import assert from "node:assert/strict";

import { createMapViewResolver } from "../../src/content/page-adapter/map-view.js";
import {
  PAGE_MAP_VIEW_PROVENANCE_KIND,
} from "../../src/content/page-adapter/page-snapshot.js";

test("map view resolver marks hash-derived views and retained motion views distinctly", () => {
  const resolver = createMapViewResolver();
  const hashResolution = resolver.resolveMapView(createContext({
    hash: "#map=16/-1.2/36.8",
  }), createResolutionInput());

  assert.deepEqual(hashResolution.mapView, {
    center: { lat: -1.2, lon: 36.8 },
    zoom: 16,
  });
  assert.deepEqual(hashResolution.mapViewProvenance, {
    kind: PAGE_MAP_VIEW_PROVENANCE_KIND.HASH,
  });

  const retainedResolution = resolver.resolveMapView(createContext(), createResolutionInput({
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 1, 2)",
      transformOriginCss: "0px 0px",
    },
  }));

  assert.deepEqual(retainedResolution.mapView, hashResolution.mapView);
  assert.deepEqual(retainedResolution.mapViewProvenance, {
    kind: PAGE_MAP_VIEW_PROVENANCE_KIND.RETAINED,
  });
});

test("map view resolver does not retain default fallback views", () => {
  const resolver = createMapViewResolver();
  const defaultResolution = resolver.resolveMapView(createContext(), createResolutionInput());
  const movingDefaultResolution = resolver.resolveMapView(createContext(), createResolutionInput({
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 1, 2)",
      transformOriginCss: "0px 0px",
    },
  }));

  assert.deepEqual(defaultResolution.mapViewProvenance, {
    kind: PAGE_MAP_VIEW_PROVENANCE_KIND.DEFAULT,
  });
  assert.deepEqual(movingDefaultResolution.mapViewProvenance, {
    kind: PAGE_MAP_VIEW_PROVENANCE_KIND.DEFAULT,
  });
});

function createContext({ hash = "" } = {}) {
  return {
    mapWindow: {
      location: { hash },
    },
    viewportDocument: {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
  };
}

function createResolutionInput(overrides = {}) {
  return {
    viewportRect: {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    },
    surfaceMotion: {
      transformCss: "none",
      transformOriginCss: "0px 0px",
    },
    ...overrides,
  };
}
