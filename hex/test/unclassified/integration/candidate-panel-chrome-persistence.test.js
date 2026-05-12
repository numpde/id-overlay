import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: candidate boundary law for panel chrome persistence.
//
// Serious alternatives considered:
// - Put panel position in application state/durable state. Rejected: panel
//   placement is browser chrome, not the user image session; it must not be
//   undoable, replayed, or hydrated through the product reducer.
// - Keep panel position adapter-local and unpersisted. Rejected: position is a
//   stable user preference and should survive reloads.
// - Let the DOM adapter read/write storage directly. Rejected: that hides
//   storage failures and lifecycle ownership inside rendering code.
// - Store panel chrome beside durable state in one untyped record. Rejected:
//   it makes migration/recovery ambiguous and invites product/chrome coupling.
//
// Preferred model: the browser lifecycle controller owns a separate
// panelChromePort. Startup reads app durable state and panel chrome independently
// and renders a normalized chrome view. Panel drag writes only panel chrome.
// Application commands, effects, history, hydration, and durable state never
// mention panel chrome.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const APPLICATION_DIR = path.join(REPO_ROOT, "hex/application");

const SAMPLE_PANEL_CHROME = Object.freeze({
  position: {
    screenPx: {
      x: 16,
      y: 16,
    },
  },
});

const VIEWPORT_PX = Object.freeze({
  width: 800,
  height: 600,
});

const PANEL_SIZE_PX = Object.freeze({
  width: 240,
  height: 120,
});

const FORBIDDEN_APPLICATION_PANEL_CHROME_PATTERNS = Object.freeze([
  /\bpanelChrome\b/,
  /\bpanelPosition\b/,
  /\bpanelScreenPx\b/,
  /\bchromePosition\b/,
  /\bid-overlay\/panel\b/,
]);

// Candidate: dragging panel chrome is not an application command. It writes
// normalized shell chrome only, leaving app runtime state and durable session
// persistence untouched.
test("candidate: panel drag writes only panel chrome", async () => {
  const durableState = durableImageState();
  const storage = createDurableStorageHarness({
    durableState,
  });
  const panelChrome = createPanelChromeHarness({
    storedChrome: SAMPLE_PANEL_CHROME,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.dispatchPanelChromeChange({
    position: {
      requestedScreenPx: {
        x: 700,
        y: 580,
      },
      panelSizePx: PANEL_SIZE_PX,
      viewportPx: VIEWPORT_PX,
    },
  });

  assert.deepEqual(panelChrome.writes, [{
    position: {
      screenPx: {
        x: 560,
        y: 480,
      },
    },
  }]);
  assert.deepEqual(result.runtime.getState(), {
    session: durableState.session,
  });
  assert.deepEqual(storage.writes, []);
});

// Candidate: product commands can re-render the panel, but they must not reset
// or rewrite persisted panel chrome. Chrome preference survives product session
// changes because it belongs to the browser-shell lifecycle.
test("candidate: product commands preserve panel chrome without chrome writes", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState(),
  });
  const panelChrome = createPanelChromeHarness({
    storedChrome: {
      position: {
        screenPx: {
          x: 44,
          y: 55,
        },
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    panelChromePort: panelChrome.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.deepEqual(host.latestRender.panelChrome, {
    position: {
      screenPx: {
        x: 44,
        y: 55,
      },
    },
  });
  assert.deepEqual(panelChrome.writes, []);
  assert.deepEqual(storage.writes, [{
    session: {
      ...durableImageState().session,
      mode: "trace",
    },
  }]);
});

// Candidate: unsupported pages have no extension chrome lifecycle. They should
// not read or write panel chrome any more than they read product durable state.
test("candidate: unsupported pages do not read panel chrome", async () => {
  const panelChrome = createPanelChromeHarness({
    storedChrome: SAMPLE_PANEL_CHROME,
  });

  const result = await bootstrapBrowserExtension(createBrowserHostHarness({
    pageContext: {
      kind: "unsupported-page",
    },
    panelChromePort: panelChrome.port,
  }));

  assert.deepEqual(result, {
    kind: "unsupported-page",
  });
  assert.equal(panelChrome.readCount, 0);
  assert.deepEqual(panelChrome.writes, []);
});

// Candidate: panel chrome failures are shell preference failures, not product
// errors. Read failure falls back to default chrome; write failure is reported
// without dispatching application commands or killing later product renders.
test("candidate: panel chrome storage failures stay outside application state", async () => {
  const readError = new Error("panel chrome read failed");
  const writeError = new Error("panel chrome write failed");
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState(),
    }).port,
    panelChromePort: {
      async readPanelChrome() {
        throw readError;
      },
      async writePanelChrome() {
        throw writeError;
      },
    },
  });

  const result = await bootstrapBrowserExtension(host);
  await host.dispatchPanelChromeChange({
    position: {
      requestedScreenPx: {
        x: 80,
        y: 90,
      },
      panelSizePx: PANEL_SIZE_PX,
      viewportPx: VIEWPORT_PX,
    },
  });
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assertSafeRenderedPanelChrome(host.latestRender.panelChrome);
  assert.deepEqual(result.runtime.getState().session.mode, "trace");
  assert.deepEqual(host.reportedErrors, [readError, writeError]);
});

// Candidate: application source should remain completely unaware of panel
// chrome. This catches the bad future where panel coordinates sneak into
// durable state, view-model state, commands, or history.
test("candidate: application source contains no panel chrome vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(APPLICATION_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const pattern of FORBIDDEN_APPLICATION_PANEL_CHROME_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} matches ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

function createBrowserHostHarness({
  pageContext = {
    kind: "supported-map-editor-page",
  },
  durableStatePort = createDurableStorageHarness({ durableState: null }).port,
  panelChromePort = createPanelChromeHarness().port,
}) {
  const reportedErrors = [];
  return {
    pageContext,
    durableStatePort,
    panelChromePort,
    reportedErrors,
    latestRender: null,
    pageViewportPx: VIEWPORT_PX,
    panelSizePx: PANEL_SIZE_PX,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    reportRuntimeError(error) {
      reportedErrors.push(error);
    },
    startRuntime(runtime) {
      return runtime;
    },
    async dispatchPanelChromeChange(change) {
      if (typeof this.handlePanelChromeChange !== "function") {
        throw new TypeError("browser shell did not expose panel chrome change dispatch");
      }
      await this.handlePanelChromeChange(change);
    },
  };
}

function createDurableStorageHarness({ durableState }) {
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
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}

function createPanelChromeHarness({ storedChrome = null } = {}) {
  const writes = [];
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readPanelChrome() {
        readCount += 1;
        return storedChrome;
      },
      async writePanelChrome(panelChrome) {
        writes.push(panelChrome);
      },
    },
  };
}

function durableImageState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}

function assertSafeRenderedPanelChrome(panelChrome) {
  const screenPx = panelChrome?.position?.screenPx;
  assert.equal(Number.isFinite(screenPx?.x), true);
  assert.equal(Number.isFinite(screenPx?.y), true);
  assert.equal(screenPx.x >= 0, true);
  assert.equal(screenPx.y >= 0, true);
  assert.equal(screenPx.x <= VIEWPORT_PX.width - PANEL_SIZE_PX.width, true);
  assert.equal(screenPx.y <= VIEWPORT_PX.height - PANEL_SIZE_PX.height, true);
}

function listJavaScriptFiles(directoryPath) {
  const files = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const filePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(filePath));
      continue;
    }
    if (entry.isFile() && filePath.endsWith(".js")) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}
