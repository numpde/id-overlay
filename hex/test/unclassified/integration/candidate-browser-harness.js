export function createBrowserHostHarness({
  pageContext = {
    kind: "supported-map-editor-page",
  },
  durableStatePort = createDurableStorageHarness({
    durableState: null,
  }).port,
  clipboardImagePort = createClipboardImageHarness().port,
  ...ports
} = {}) {
  const ownedRoots = new Map();
  const reportedErrors = [];
  return {
    pageContext,
    durableStatePort,
    clipboardImagePort,
    reportedErrors,
    latestRender: null,
    renderCount: 0,
    runtime: null,
    ...ports,
    mountOwnedRoot(ownerId, root = {}) {
      const ownedRoot = {
        ...root,
        ownerId,
      };
      ownedRoots.set(ownerId, ownedRoot);
      return ownedRoot;
    },
    countOwnedRoots(ownerId) {
      return ownedRoots.has(ownerId) ? 1 : 0;
    },
    removeOwnedRoot(ownerId) {
      ownedRoots.delete(ownerId);
    },
    renderApplicationView(render) {
      this.renderCount += 1;
      this.latestRender = render;
    },
    reportRuntimeError(error) {
      reportedErrors.push(error);
    },
    startRuntime(runtime) {
      this.runtime = runtime;
      return runtime;
    },
  };
}

export function createDurableStorageHarness({
  durableState,
  readError = null,
  writeError = null,
} = {}) {
  const writes = [];
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readDurableState() {
        readCount += 1;
        if (readError) {
          throw readError;
        }
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        if (writeError) {
          throw writeError;
        }
        writes.push(nextDurableState);
      },
    },
  };
}

export function createClipboardImageHarness({
  readReferenceImageResults = [{
    kind: "empty",
  }],
  readReferenceImageFromPasteEventResults = readReferenceImageResults,
} = {}) {
  const pasteEventImageHandles = [];
  let readReferenceImageCount = 0;
  let readReferenceImageFromPasteEventCount = 0;
  return {
    get readReferenceImageCount() {
      return readReferenceImageCount;
    },
    get readReferenceImageFromPasteEventCount() {
      return readReferenceImageFromPasteEventCount;
    },
    pasteEventImageHandles,
    port: {
      async readReferenceImage() {
        const result = readReferenceImageResults[readReferenceImageCount]
          ?? readReferenceImageResults.at(-1)
          ?? {
            kind: "empty",
          };
        readReferenceImageCount += 1;
        return result;
      },
      async readReferenceImageFromPasteEvent({ imageHandle }) {
        pasteEventImageHandles.push(imageHandle);
        const result = readReferenceImageFromPasteEventResults[readReferenceImageFromPasteEventCount]
          ?? readReferenceImageFromPasteEventResults.at(-1)
          ?? {
            kind: "empty",
          };
        readReferenceImageFromPasteEventCount += 1;
        return result;
      },
    },
  };
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

export async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

export function durableImageState({
  mode = "align",
  referenceImage = normalizedReferenceImage(),
  placement = undefined,
  opacity = undefined,
  pins = undefined,
} = {}) {
  const session = {
    mode,
    referenceImage,
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

export function normalizedReferenceImage(label = "reference-image") {
  return {
    imageDataRef: `data:image/png;base64,${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

export function placement({
  x = 80,
  y = 40,
  scale = 1,
  rotationRad = 0,
} = {}) {
  return {
    x,
    y,
    scale,
    rotationRad,
  };
}

export function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}
