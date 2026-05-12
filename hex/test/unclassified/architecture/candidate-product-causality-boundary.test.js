import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPLICATION_COMMAND_KIND,
} from "../../../application/command.js";

// Unclassified: normative candidate tests for "Product causality and browser
// mechanics" in the rebuild charter. These tests are intentionally about
// architectural direction, not current implementation convenience. They should
// fail any design where the browser shell becomes a hidden product state machine
// or the application starts naming browser mechanics as product concepts.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const BOOTSTRAP_DIR = path.join(REPO_ROOT, "hex/bootstrap");
const CONTENT_DIR = path.join(REPO_ROOT, "src/content");

const SHELL_WATCHED_PRODUCT_FIELDS = Object.freeze([
  "referenceImageInput",
  "panelIntent",
  "notice",
  "history",
  "registration",
  "placement",
  "opacity",
]);

const SHELL_WATCHER_ACTIONS = Object.freeze([
  "readReferenceImage",
  "startManualPaste",
  "startManualPasteCapture",
  "cancelManualPaste",
  "cancelManualPasteCapture",
  "startTimer",
  "cancelTimer",
  "releaseImageDataRef",
  "solveRegistrationPlacement",
]);

// Candidate: bootstrap/content may wire adapters and pass state to render, but
// they must not pair product field checks with browser work. This catches the
// specific forbidden pattern: "if notice/referenceImageInput/panelIntent exists,
// then start a timer/read clipboard/etc."
test("candidate: shell source does not watch product fields to perform browser work", () => {
  const violations = [];
  for (const filePath of [
    ...listJavaScriptFiles(BOOTSTRAP_DIR),
    ...listJavaScriptFiles(CONTENT_DIR),
  ]) {
    const source = readSource(filePath);
    const mentionedFields = SHELL_WATCHED_PRODUCT_FIELDS
      .filter((field) => source.includes(field));
    const mentionedActions = SHELL_WATCHER_ACTIONS
      .filter((action) => source.includes(action));

    if (mentionedFields.length > 0 && mentionedActions.length > 0) {
      violations.push([
        relativeToRepo(filePath),
        `fields: ${mentionedFields.join(", ")}`,
        `actions: ${mentionedActions.join(", ")}`,
      ].join(" | "));
    }
  }

  assert.deepEqual(violations, []);
});

// Candidate: adapters may emit normalized facts and the shell may project them,
// but application command names remain semantic. This keeps raw browser events
// from leaking into replayable product causality.
test("candidate: raw browser event vocabulary is absent from application command kinds", () => {
  const rawEventWords = [
    "click",
    "pointer",
    "mouse",
    "wheel",
    "keydown",
    "keyup",
    "paste-event",
    "paste-handle",
  ];

  assert.deepEqual(
    Object.values(APPLICATION_COMMAND_KIND).flatMap((kind) => (
      rawEventWords
        .filter((word) => kind.includes(word))
        .map((word) => `${kind} contains raw event word ${word}`)
    )),
    [],
  );
});

function listJavaScriptFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }
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

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}
