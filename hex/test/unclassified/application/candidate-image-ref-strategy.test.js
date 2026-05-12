import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  selectApplicationView,
} from "../../../application/view-model.js";

// Unclassified: candidate law for the reference-image ref strategy.
//
// Serious alternatives considered:
// - Store browser runtime URLs (`blob:`, extension URLs, object URL handles) in
//   app state. Rejected: they are document/runtime scoped and cannot be a
//   durable, replayable product fact.
// - Store browser objects (`Blob`, `File`, `ImageBitmap`, DOM images) in app
//   state. Rejected by the plain-data boundary and by reload semantics.
// - Have the application emit object-url create/revoke effects. Rejected:
//   object URLs are renderer mechanics. The renderer may create and revoke them
//   while satisfying a view, but that is not product causality.
// - Make every image a storage asset immediately. Plausible later, but too
//   heavy as a first law. The app only needs a stable durable image ref string;
//   whether that ref is an inline data URL or a content-addressed key is an
//   adapter/storage decision.
//
// Preferred model: `referenceImage.imageDataRef` is a stable durable image
// reference, not a runtime resource handle. It is plain application data,
// survives persistence and history replay, and may be rendered or resolved by
// adapters without leaking runtime resource ownership back into the app.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const APPLICATION_DIR = path.join(REPO_ROOT, "hex/application");

const EFFECT_KIND = Object.freeze({
  PERSIST_DURABLE_STATE: "persist-durable-state",
});

const FORBIDDEN_APPLICATION_IMAGE_MECHANICS = Object.freeze([
  "objectURL",
  "ObjectURL",
  "createObjectURL",
  "revokeObjectURL",
  "releaseImageDataRef",
  "release-image-data-ref",
  "Blob",
  "File",
  "ImageBitmap",
  "new Image",
  "dataTransfer",
]);

// Candidate: the view is allowed to expose the durable image ref as a render
// fact. It must not expose a second runtime-url slot that turns the application
// view model into a browser resource cache.
test("candidate: application view exposes durable image ref, not runtime image resources", () => {
  const referenceImage = normalizedReferenceImage("stable-reference-image");
  const view = selectApplicationView({
    session: {
      mode: "align",
      referenceImage,
    },
  });

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: referenceImage.imageDataRef,
    intrinsicSizePx: referenceImage.intrinsicSizePx,
    placement: null,
    opacity: 1,
    pins: [],
  });
  assert.equal(JSON.stringify(view).includes("objectUrl"), false);
  assert.equal(JSON.stringify(view).includes("blob:"), false);
});

// Candidate: undoing image removal replays the durable image ref. It must not
// ask the browser for a new image, and it must not treat the old durable ref as
// a runtime handle that needs explicit release/recreation by the app.
test("candidate: undoing image removal restores the durable image ref without image IO effects", () => {
  const before = durableImageState({
    referenceImage: normalizedReferenceImage("stable-reference-image"),
  });
  const record = {
    kind: "remove-reference-image",
    undoLabel: "Reload image",
    redoLabel: "Remove image",
    before,
    after: null,
  };

  const result = handleApplicationCommand({
    state: {
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.deepEqual(result, {
    state: {
      session: before.session,
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [{
      kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
      durableState: before,
    }],
  });
  assertNoImageIoEffects(result.effects);
});

// Candidate: the application layer should not contain browser image-resource
// ownership vocabulary at all. If this fails, either the application has started
// doing renderer work or a product concept has been named after a browser
// tactic.
test("candidate: application source contains no runtime image-resource mechanics", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(APPLICATION_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const mechanic of FORBIDDEN_APPLICATION_IMAGE_MECHANICS) {
      if (source.includes(mechanic)) {
        violations.push(`${relativeToRepo(filePath)} mentions ${mechanic}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

function durableImageState({ referenceImage }) {
  return {
    session: {
      mode: "align",
      referenceImage,
    },
  };
}

function normalizedReferenceImage(label, overrides = {}) {
  return {
    imageDataRef: `data:image/png;base64,${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    ...overrides,
  };
}

function assertNoImageIoEffects(effects) {
  for (const effect of effects) {
    assert.notEqual(effect.kind, "request-reference-image-input");
    assert.notEqual(effect.kind, "release-image-data-ref");
    assert.notEqual(effect.kind, "create-object-url");
    assert.notEqual(effect.kind, "revoke-object-url");
  }
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
  return files;
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}
