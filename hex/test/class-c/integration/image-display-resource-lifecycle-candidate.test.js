import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: display resources are runtime cache, not application state. Hydrating
// a durable image should resolve its stable `imageDataRef` into a browser-
// loadable display URL at the shell/render boundary, but that display-resource
// port does not exist yet.
//
// Decision: keep quarantined. This should be promoted only with the broader
// image resource ownership cut-over so acquisition, render, and release are one
// coherent lifecycle.
test("browser shell resolves display resources without polluting application state", async () => {
  const referenceImage = normalizedReferenceImage("old");
  const displayResources = createDisplayResourceHarness({
    resourcesByRef: {
      [referenceImage.imageDataRef]: {
        displayResourceId: "display-old",
        displayImageUrl: "blob:https://www.openstreetmap.org/display-old",
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState(referenceImage),
    }).port,
    referenceImageDisplayResourcePort: displayResources.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(displayResources.acquisitions, [{
    imageDataRef: referenceImage.imageDataRef,
  }]);
  assert.equal(JSON.stringify(result.runtime.getState()).includes("blob:"), false);
  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: referenceImage.imageDataRef,
    displayImageUrl: "blob:https://www.openstreetmap.org/display-old",
    intrinsicSizePx: referenceImage.intrinsicSizePx,
    placement: null,
    opacity: 1,
    pins: [],
  });
});

// Class-c: display resources should have render lifetime, but release semantics
// are not meaningful until acquisition is implemented.
test("browser shell releases display resources when the image is no longer rendered", async () => {
  const referenceImage = normalizedReferenceImage("old");
  const storage = createDurableStorageHarness({
    durableState: durableImageState(referenceImage),
  });
  const displayResources = createDisplayResourceHarness({
    resourcesByRef: {
      [referenceImage.imageDataRef]: {
        displayResourceId: "display-old",
        displayImageUrl: "blob:https://www.openstreetmap.org/display-old",
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageDisplayResourcePort: displayResources.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.deepEqual(displayResources.releases, [{
    imageDataRef: referenceImage.imageDataRef,
    displayResourceId: "display-old",
  }]);
});

function createBrowserHostHarness({
  durableStatePort,
  referenceImageDisplayResourcePort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    referenceImageDisplayResourcePort,
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
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createDisplayResourceHarness({ resourcesByRef }) {
  const acquisitions = [];
  const releases = [];
  return {
    acquisitions,
    releases,
    port: {
      async acquireDisplayResource({ imageDataRef }) {
        acquisitions.push({
          imageDataRef,
        });
        return resourcesByRef[imageDataRef];
      },
      async releaseDisplayResource({ imageDataRef, displayResourceId }) {
        releases.push({
          imageDataRef,
          displayResourceId,
        });
      },
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

function durableImageState(referenceImage) {
  return {
    session: {
      mode: "align",
      referenceImage,
    },
  };
}

function normalizedReferenceImage(label) {
  return {
    imageDataRef: `reference-image-data-${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
