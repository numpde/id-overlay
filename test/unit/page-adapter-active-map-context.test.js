import test from "node:test";
import assert from "node:assert/strict";

import {
  createActiveMapContextResolver,
} from "../../src/content/page-adapter/active-map-context.js";

test("active map context support accepts OpenStreetMap edit pages only", () => {
  assert.equal(createResolver({
    location: {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit",
    },
  }).isSupported(), true);
  assert.equal(createResolver({
    location: {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit/history",
    },
  }).isSupported(), true);
  assert.equal(createResolver({
    location: {
      origin: "https://www.openstreetmap.org",
      pathname: "/way/1",
    },
  }).isSupported(), false);
  assert.equal(createResolver({
    location: {
      origin: "https://example.com",
      pathname: "/edit",
    },
  }).isSupported(), false);
});

test("active map context support handles inaccessible location objects", () => {
  const hashTarget = {};
  Object.defineProperty(hashTarget, "location", {
    get() {
      throw new Error("cross-origin");
    },
  });
  const resolver = createActiveMapContextResolver({
    hashTarget,
    viewportDocument: createDocumentHarness(),
  });

  assert.equal(resolver.isSupported(), false);
});

test("active map context uses the native page when no embedded iD frame exists", () => {
  const hashTarget = {};
  const viewportDocument = createDocumentHarness();
  const resolver = createActiveMapContextResolver({
    hashTarget,
    viewportDocument,
  });

  assert.deepEqual(resolver.getActiveMapContext(), {
    mapWindow: hashTarget,
    viewportDocument,
    frameElement: null,
  });
});

test("active map context prefers the embedded iD frame when present", () => {
  const hashTarget = {};
  const embeddedContext = {
    contentWindow: {},
    contentDocument: createDocumentHarness(),
  };
  embeddedContext.contentWindow.location = {
    origin: "https://www.openstreetmap.org",
    pathname: "/id",
  };
  const viewportDocument = createDocumentHarness({
    embedFrame: embeddedContext,
  });
  const resolver = createActiveMapContextResolver({
    hashTarget,
    viewportDocument,
  });

  assert.deepEqual(resolver.getActiveMapContext(), {
    mapWindow: embeddedContext.contentWindow,
    viewportDocument: embeddedContext.contentDocument,
    frameElement: embeddedContext,
  });
});

function createResolver({ location }) {
  return createActiveMapContextResolver({
    hashTarget: { location },
    viewportDocument: createDocumentHarness(),
  });
}

function createDocumentHarness({ embedFrame = null } = {}) {
  return {
    querySelector(selector) {
      assert.equal(selector, "#id-embed");
      return embedFrame;
    },
  };
}
