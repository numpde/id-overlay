import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { repoPath } from "../helpers/paths.js";

// Master architecture note:
//
// Content reports browser/user/page facts.
// The machine interprets those facts against current state.
// The machine alone owns durable mutation, status, history, effects, and replay.
// View models expose render data only; they never return executable events.
// History stores semantic before/after records, not executable undo/redo events.
// Effects return typed result facts, not public mutation/completion events.
// Page integration exposes explicit snapshot, projection, and gesture ports.
//
// This file is the target-shape executable checklist. Tests marked TODO are
// intentionally ahead of the implementation: they should be converted to normal
// passing tests as each seam is cut over. Keep this file add-only until the
// corresponding production slice is implemented.

const SOURCE_DIR = repoPath("src");
const CONTENT_DIR = repoPath("src/content");
const MACHINE_DIR = repoPath("src/core/machine");
const TEST_DIR = repoPath("test");

const MASTER_SEAMS = Object.freeze([
  "public user/fact ingress",
  "private mutation and replay",
  "render-only view models",
  "semantic history records",
  "typed effect results",
  "explicit page ports",
]);

test("master checklist names the target seams", () => {
  assert.deepEqual(MASTER_SEAMS, [
    "public user/fact ingress",
    "private mutation and replay",
    "render-only view models",
    "semantic history records",
    "typed effect results",
    "explicit page ports",
  ]);
});

test("content does not author low-level machine events", {
  todo: "Cut content over to public user/fact ingress.",
}, () => {
  const violations = [];
  const forbiddenPatterns = [
    ["machine event import", /\bMACHINE_EVENT_KIND\b/],
    ["generic machine dispatch port", /\bdispatchMachine\s*\(|\bmachineHost\.dispatch\s*\(/],
    ["low-level event object", /\btype:\s*MACHINE_EVENT_KIND\./],
  ];

  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    const source = readSource(filePath);
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(formatViolation(filePath, name));
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("panel view model exposes render data only", {
  todo: "Move panel activation semantics into the machine and keep view models event-free.",
}, () => {
  const source = readSource(repoPath("src/content/panel-view-model.js"));
  const forbiddenPatterns = [
    ["machine event vocabulary", /\bMACHINE_EVENT_KIND\b/],
    ["event constructor import", /\bcreate[A-Z]\w*Event\b/],
    ["executable action event", /\bevent\s*:/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("public machine event vocabulary contains only user intents and external facts", {
  todo: "Split public ingress from private mutation, runtime, status, replay, and completion commands.",
}, () => {
  const source = readSource(repoPath("src/core/machine/events.js"));
  const forbiddenPublicEvents = [
    "LOAD_IMAGE",
    "CLEAR_IMAGE",
    "RESTORE_IMAGE_SESSION",
    "SELECT_MODE",
    "UPDATE_POINTER_RUNTIME",
    "BEGIN_POINTER_GESTURE",
    "END_POINTER_GESTURE",
    "SET_INPUT_OVERRIDE",
    "RESET_INPUT_RUNTIME",
    "SET_OPACITY",
    "TOGGLE_PIN",
    "ADD_PIN",
    "REMOVE_PIN",
    "CLEAR_PINS",
    "RESTORE_REGISTRATION",
    "FIT_OVERLAY",
    "BEGIN_PLACEMENT_EDIT",
    "PREVIEW_PLACEMENT_EDIT",
    "COMMIT_PLACEMENT_EDIT",
    "CANCEL_PLACEMENT_EDIT",
    "APPLY_PLACEMENT_EDIT",
    "RESTORE_PLACEMENT",
    "UNDO",
    "REDO",
    "REQUEST_PANEL_INTENT",
    "CANCEL_PANEL_INTENT",
    "REPORT_STATUS_NOTICE",
    "CLEAR_STATUS_NOTICE",
    "COMPLETE_PASTE_READ",
  ];

  const violations = forbiddenPublicEvents.filter((eventName) => {
    return new RegExp(`\\b${eventName}\\s*:`).test(source);
  });

  assert.deepEqual(violations, []);
});

test("history records are semantic facts, not executable events", {
  todo: "Replace undoEvent/redoEvent replay with typed semantic history records.",
}, () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(MACHINE_DIR)) {
    const source = readSource(filePath);
    if (/\b(?:undoEvent|redoEvent)\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("effect and timer completion returns typed facts instead of dispatching commands", {
  todo: "Replace completion event construction in host/effect runner with typed effect results.",
}, () => {
  const sources = new Map([
    ["src/core/machine/effect-runner.js", readSource(repoPath("src/core/machine/effect-runner.js"))],
    ["src/core/machine/host.js", readSource(repoPath("src/core/machine/host.js"))],
  ]);
  const forbiddenPatterns = [
    ["paste completion event", /\bcreateCompletePasteReadEvent\b/],
    ["panel cancel event", /\bcreateCancelPanelIntentEvent\b/],
    ["status clear command", /\bMACHINE_EVENT_KIND\.CLEAR_STATUS_NOTICE\b/],
    ["host/effect dispatch callback", /\bdispatch\s*\(/],
  ];
  const violations = [];

  for (const [relativePath, source] of sources) {
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${name}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("page integration exposes explicit ports instead of a broad adapter object", {
  todo: "Split page adapter into snapshot, projection, map-view, and gesture ports.",
}, () => {
  const source = readSource(repoPath("src/content/page-adapter.js"));
  const broadPortMethods = [
    "getSnapshot",
    "clientPointToScreen",
    "screenPointToClient",
    "mapToScreen",
    "mapToOverlayLayerScreen",
    "screenToMap",
    "beginMapPan",
    "updateMapPan",
    "endMapPan",
    "forwardMapZoom",
  ];
  const violations = broadPortMethods.filter((methodName) => {
    return new RegExp(`\\b${methodName}\\s*\\(`).test(source);
  });

  assert.deepEqual(violations, []);
});

test("tests exercise public ingress instead of raw mutation events", {
  todo: "Rewrite tests around public user/fact helpers and private domain tests.",
}, () => {
  const violations = [];
  const forbiddenPatterns = [
    ["raw machine event vocabulary", /\bMACHINE_EVENT_KIND\b/],
    ["flat transition dispatch", /\btransitionMachine\s*\(/],
    ["host raw dispatch", /\bmachineHost\.dispatch\s*\(/],
    ["event-shaped history", /\b(?:undoEvent|redoEvent)\b/],
  ];

  for (const filePath of listJavaScriptFiles(TEST_DIR)) {
    if (filePath === import.meta.filename) {
      continue;
    }
    const source = readSource(filePath);
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(formatViolation(filePath, name));
      }
    }
  }

  assert.deepEqual(violations, []);
});

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function formatViolation(filePath, name) {
  return `${path.relative(repoPath(), filePath)}: ${name}`;
}

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}
