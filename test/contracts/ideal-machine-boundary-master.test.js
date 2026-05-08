import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { repoPath } from "../helpers/paths.js";
import {
  formatViolation,
  listJavaScriptFiles,
  listTestNames,
  readSource,
  sourceFileExists,
} from "../helpers/source-scan.js";
import "./machine-boundary-contracts.js";

// Master architecture note:
//
// Content reports browser/user/page facts.
// The machine interprets those facts against current state.
// The machine alone owns durable mutation, status, history, effects, and replay.
// View models expose render data only; they never return executable events.
// History stores semantic before/after records, not executable undo/redo events.
// Effects return typed result facts, not public mutation/completion events.
// Host-side persistence and effects observe committed results through one lifecycle boundary.
// Page integration exposes explicit snapshot, projection, and gesture ports.
//
// This file is the target-shape executable checklist. Every test is an active
// contract for the intended architecture, not a placeholder for later cleanup.

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
  "committed result lifecycle",
  "explicit page ports",
  "canonical action selectors",
  "storage-shaped persistence",
  "normalized input facts",
  "machine-owned status copy",
  "explicit transition finalization",
  "render-only overlay renderer",
]);

test("master checklist names the target seams", () => {
  assert.deepEqual(MASTER_SEAMS, [
    "public user/fact ingress",
    "private mutation and replay",
    "render-only view models",
    "semantic history records",
    "typed effect results",
    "committed result lifecycle",
    "explicit page ports",
    "canonical action selectors",
    "storage-shaped persistence",
    "normalized input facts",
    "machine-owned status copy",
    "explicit transition finalization",
    "render-only overlay renderer",
  ]);
});

test("content does not author low-level machine events", () => {
  const violations = [];
  const forbiddenPatterns = [
    ["machine event import", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["generic machine dispatch port", /\bdispatchMachine\s*\(|\bmachineHost\.dispatch\s*\(/],
    ["low-level event object", /\btype:\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\./],
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

test("panel view model exposes render data only", () => {
  const source = readSource(repoPath("src/content/panel-view-model.js"));
  const forbiddenPatterns = [
    ["machine event vocabulary", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["event constructor import", /\bcreate[A-Z]\w*Event\b/],
    ["executable action event", /\bevent\s*:/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("panel DOM reports product activations instead of resolving command meaning", () => {
  const panelSource = readSource(repoPath("src/content/panel.js"));
  const bindingSource = readSource(repoPath("src/content/panel-bindings.js"));
  const boundarySource = `${panelSource}\n${bindingSource}`;
  const forbiddenPatterns = [
    ["machine event vocabulary", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["mode enum import", /\bMACHINE_MODE\b/],
    ["live state action lookup", /\bselectPanelView\s*\(\s*machineHost\.getState\s*\(\s*\)\s*\)/],
    ["view-model executable event dispatch", /\bdispatchMachineEvent\s*\(\s*action\.event\s*\)/],
    ["generic machine dispatch wrapper", /\bfunction\s+dispatchMachineEvent\s*\(/],
  ];
  const requiredPatterns = [
    ["panel binding boundary", /\bbindPanelControls\b/],
    ["primary activation ingress", /\b(?:activatePanelPrimary|ingestPanelPrimary|reportPanelPrimaryActivated)\b/],
    ["history activation ingress", /\b(?:activateUndo|activateRedo|ingestHistoryActivation|reportHistoryActivated)\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(boundarySource))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(boundarySource))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("primary panel action has one canonical machine-owned selector", () => {
  const policySource = readSource(repoPath("src/core/machine/policy.js"));
  const panelPrimaryActionSource = readSource(repoPath("src/core/machine/panel-primary-action.js"));
  const panelViewSource = readSource(repoPath("src/content/panel-view-model.js"));
  const violations = [];

  if (!/\bselectPanelPrimaryAction\b/.test(policySource)) {
    violations.push("missing: selectPanelPrimaryAction");
  }
  if (!/\bselectPanelPrimaryAction\b/.test(panelPrimaryActionSource)) {
    violations.push("missing: primary action executor uses canonical selector");
  }
  if (/\bfunction\s+resolveMainAction\s*\(/.test(panelViewSource)) {
    violations.push("forbidden: content-local primary action resolver");
  }
  if (/\bPANEL_MAIN_ACTION\b/.test(panelViewSource)) {
    violations.push("forbidden: content-local primary action vocabulary");
  }
  if (/\bMACHINE_PANEL_INTENT\b/.test(panelViewSource)) {
    violations.push("forbidden: panel intent interpretation in view model");
  }

  assert.deepEqual(violations, []);
});

test("status text is machine-owned and content view models do not format notices", () => {
  const panelViewSource = readSource(repoPath("src/content/panel-view-model.js"));
  const selectorsSource = readSource(repoPath("src/core/machine/selectors.js"));
  const violations = [];

  if (/\bMACHINE_STATUS_NOTICE_KIND\b/.test(panelViewSource)) {
    violations.push("forbidden: status notice vocabulary in content view model");
  }
  if (/\bfunction\s+(?:selectStatus|formatStatusNotice|selectBaselineStatus)\s*\(/.test(panelViewSource)) {
    violations.push("forbidden: content-local status formatter");
  }
  if (/\bPANEL_STATUS_MESSAGE\b/.test(panelViewSource)) {
    violations.push("forbidden: content-local status copy vocabulary");
  }
  if (!/\bselectPanelStatusText\b/.test(selectorsSource)) {
    violations.push("missing: core panel status text selector");
  }

  assert.deepEqual(violations, []);
});

test("public machine event vocabulary contains only user intents and external facts", () => {
  const source = readSource(repoPath("src/core/machine/events.js"));
  const forbiddenPatterns = [
    ["public low-level event vocabulary", /\bexport\s+const\s+MACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["public status notice vocabulary", /\bexport\s+const\s+MACHINE_STATUS_NOTICE_KIND\b/],
    ["low-level command constructor", /\bexport\s+function\s+create(?:LoadImage|CancelPanelIntent|ReportStatusNotice)Event\b/],
    ["public machine command payload", /\btype:\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\./],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("machine host exposes explicit ingress, not generic dispatch", () => {
  const source = readSource(repoPath("src/core/machine/host.js"));
  const hostedRuntimeSource = readSource(repoPath("src/core/machine/host-runtime.js"));
  const forbiddenPatterns = [
    ["public dispatch function", /\bfunction\s+dispatch\s*\(/],
    ["dispatch returned from host", /\breturn\s*\{[^}]*\bdispatch\b/s],
    ["runtime raw dispatch", /\bruntime\.dispatch\s*\(/],
    ["panel checked adapter", /\bactivatePanelMode\b/],
    ["panel primary adapter", /\bactivatePanelPrimary\b/],
    ["panel opacity adapter", /\bchangePanelOpacity\b/],
  ];
  const hostRequiredPatterns = [
    ["explicit user ingress verb", /\bfunction\s+(?:loadImage|selectMode|setOpacity|togglePin|activateUndo)\b/],
  ];
  const hostedRuntimeRequiredPatterns = [
    ["effect-result ingress", /\bfunction\s+completeEffectResult\b/],
  ];

  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...hostRequiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
    ...hostedRuntimeRequiredPatterns
      .filter(([, pattern]) => !pattern.test(hostedRuntimeSource))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("machine runtime is private state/effect plumbing, not a public event dispatcher", () => {
  const source = readSource(repoPath("src/core/machine/runtime.js"));
  const forbiddenPatterns = [
    ["transition import", /\bimport\s+\{\s*transitionMachine\s*\}/],
    ["generic dispatch method", /\bfunction\s+dispatch\s*\(\s*event\b/],
    ["injected transition override", /\{\s*transition\s*=\s*transitionMachine\s*\}/],
    ["event argument in runtime dispatch", /\bruntime\.dispatch\s*\(\s*event\b/],
  ];
  const requiredPatterns = [
    ["private apply result API", /\b(?:applyTransitionResult|commitMachineResult|runMachineResult)\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("host runtime routes persistence and effects through one committed-result lifecycle", () => {
  const hostRuntimeSource = readSource(repoPath("src/core/machine/host-runtime.js"));
  const lifecycleSource = readSource(repoPath("src/core/machine/host-result-lifecycle.js"));
  const persistenceSource = readSource(repoPath("src/core/machine/host-persistence-service.js"));
  const forbiddenRuntimePatterns = [
    ["inline effect loop", /\bfor\s*\(\s*const\s+effect\s+of\b/],
    ["inline effect helper", /\bfunction\s+runEffects\s*\(/],
    ["persistence subscription ownership", /\bruntime\.subscribe\s*\(\s*persist/],
  ];
  const requiredPatterns = [
    ["host runtime lifecycle composition", hostRuntimeSource, /\bcreateMachineHostResultLifecycle\b/],
    ["lifecycle persists committed result", lifecycleSource, /\bpersistCommittedResult\b/],
    ["lifecycle schedules committed effects", lifecycleSource, /\brunCommittedEffects\b/],
  ];
  const violations = [
    ...forbiddenRuntimePatterns
      .filter(([, pattern]) => pattern.test(hostRuntimeSource))
      .map(([name]) => `forbidden: ${name}`),
    ...(persistenceSource.includes("runtime.subscribe")
      ? ["forbidden: persistence service subscribes to runtime"]
      : []),
    ...requiredPatterns
      .filter(([, source, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("transition entrypoint exposes explicit committed domain transitions", () => {
  const source = readSource(repoPath("src/core/machine/transition.js"));
  const forbiddenPatterns = [
    ["flat event switch", /\bswitch\s*\(\s*event\.type\s*\)/],
    ["public undo special case", /event\.type\s*===\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\.UNDO/],
    ["public redo special case", /event\.type\s*===\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\.REDO/],
    ["mutation command cases", /\bcase\s+MACHINE_(?:PRIVATE_)?COMMAND_KIND\.(?:CLEAR_IMAGE|SET_OPACITY|ADD_PIN|REMOVE_PIN|APPLY_PLACEMENT_EDIT|RESTORE_PLACEMENT)\b/],
    ["private command vocabulary", /\bMACHINE_PRIVATE_COMMAND_KIND\b/],
  ];
  const requiredPatterns = [
    ["explicit load transition", /\bexport\s+function\s+transitionLoadImage\b/],
    ["explicit pin transition", /\bexport\s+function\s+transitionTogglePin\b/],
    ["transition result finalization call", /\bcommitMachineTransitionResult\b/],
  ];

  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("transition result finalization is explicit and domain-local, not hidden behind commit booleans", () => {
  const sources = new Map([
    ["src/core/machine/transition.js", readSource(repoPath("src/core/machine/transition.js"))],
    [
      "src/core/machine/effect-result-transition.js",
      readSource(repoPath("src/core/machine/effect-result-transition.js")),
    ],
    [
      "src/core/machine/transition-finalization.js",
      readSource(repoPath("src/core/machine/transition-finalization.js")),
    ],
    ["src/core/machine/transition-result.js", readSource(repoPath("src/core/machine/transition-result.js"))],
    ["src/core/machine/history-replay-transition.js", readSource(repoPath("src/core/machine/history-replay-transition.js"))],
  ]);
  const forbiddenPatterns = [
    ["commit history boolean", /\bcommitHistory\b/],
    ["commit status boolean", /\bcommitStatus\b/],
    ["generic finalizer", /\bfinalizeTransitionResult\b/],
  ];
  const requiredPatterns = [
    ["canonical transition result finalizer", /\bexport\s+function\s+commitMachineTransitionResult\b/],
    ["history result combinator", /\b(?:withHistoryRecord|commitSemanticHistoryRecord)\b/],
    ["status result combinator", /\b(?:withStatusNotice|applyMachineStatusNotice)\b/],
  ];
  const violations = [];
  const combinedSource = [...sources.values()].join("\n");
  const finalizationSource = sources.get("src/core/machine/transition-finalization.js");
  const finalizerOwnerFiles = new Set([
    repoPath("src/core/machine/history.js"),
    repoPath("src/core/machine/panel-status-transition.js"),
    repoPath("src/core/machine/transition-finalization.js"),
  ]);

  for (const [relativePath, source] of sources) {
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: forbidden: ${name}`);
      }
    }
    if (
      relativePath !== "src/core/machine/transition-finalization.js" &&
      /\bapplyMachineStatusNotice\s*\(\s*commitSemanticHistoryRecord\b/s.test(source)
    ) {
      violations.push(`${relativePath}: forbidden: inline finalization composition`);
    }
  }
  for (const [name, pattern] of requiredPatterns) {
    if (!pattern.test(combinedSource)) {
      violations.push(`missing: ${name}`);
    }
  }
  if (!/\bapplyMachineStatusNotice\s*\(\s*commitSemanticHistoryRecord\b/s.test(finalizationSource)) {
    violations.push("missing: finalizer owns history-before-status order");
  }
  for (const filePath of listJavaScriptFiles(MACHINE_DIR)) {
    if (finalizerOwnerFiles.has(filePath)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\b(?:applyMachineStatusNotice|commitSemanticHistoryRecord)\b/.test(source)) {
      violations.push(`${path.relative(repoPath(), filePath)}: forbidden: direct finalizer ownership`);
    }
  }

  assert.deepEqual(violations, []);
});

test("history records are semantic facts, not executable events", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(MACHINE_DIR)) {
    const source = readSource(filePath);
    if (/\b(?:undoEvent|redoEvent)\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("machine state serialization never depends on executable replay payloads", () => {
  const source = readSource(repoPath("src/core/machine/state.js"));
  const forbiddenPatterns = [
    ["undo event serialization", /\bserializeMachineValue\s*\(\s*record\.undoEvent\b/],
    ["redo event serialization", /\bserializeMachineValue\s*\(\s*record\.redoEvent\b/],
    ["event-shaped history normalization", /\b(?:undoEvent|redoEvent)\s*:/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("history replay never re-enters public ingress", () => {
  const source = readSource(repoPath("src/core/machine/history-replay-transition.js"));
  const forbiddenPatterns = [
    ["selects replay event", /\bselectEvent\b/],
    ["calls transitionSemantic", /\btransitionSemantic\s*\(/],
    ["reads undo/redo event payload", /\brecord\.(?:undoEvent|redoEvent)\b/],
  ];
  const requiredPatterns = [
    ["semantic record replay", /\breplay(?:History|Semantic|Domain)Record\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("effect and timer completion returns typed facts instead of dispatching commands", () => {
  const sources = new Map([
    ["src/core/machine/effect-runner.js", readSource(repoPath("src/core/machine/effect-runner.js"))],
    [
      "src/core/machine/effect-result-transition.js",
      readSource(repoPath("src/core/machine/effect-result-transition.js")),
    ],
    ["src/core/machine/host.js", readSource(repoPath("src/core/machine/host.js"))],
    ["src/core/machine/host-runtime.js", readSource(repoPath("src/core/machine/host-runtime.js"))],
  ]);
  const forbiddenPatterns = [
    ["paste completion event", /\bcreateCompletePasteReadEvent\b/],
    ["panel cancel event", /\bcreateCancelPanelIntentCommand\b/],
    ["status clear command", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\.CLEAR_STATUS_NOTICE\b/],
    ["host/effect dispatch callback", /\bdispatch\s*\(/],
    ["central effect-result transition switch", /\bswitch\s*\(\s*result\?\.kind\s*\)/],
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

test("machine effect vocabulary is split by concern", () => {
  const effectResultsSource = readSource(repoPath("src/core/machine/effect-results.js"));
  const effectRunnerSource = readSource(repoPath("src/core/machine/effect-runner.js"));
  const pasteReadSource = readSource(repoPath("src/core/machine/paste-read.js"));
  const eventsSource = readSource(repoPath("src/core/machine/events.js"));
  const violations = [];

  if (sourceFileExists(repoPath("src/core/machine/effects.js"))) {
    violations.push("forbidden: broad effects registry");
  }
  if (!/\bMACHINE_EFFECT_RESULT_KIND\b/.test(effectResultsSource)) {
    violations.push("missing: MACHINE_EFFECT_RESULT_KIND");
  }
  if (!/\bcreateReadPasteImageResult\b/.test(effectResultsSource)) {
    violations.push("missing: paste read result constructor");
  }
  if (!/\bMACHINE_PASTE_READ_OUTCOME_KIND\b/.test(pasteReadSource)) {
    violations.push("missing: paste read outcome vocabulary");
  }
  if (/\bswitch\s*\(\s*effect\?\.kind\s*\)/.test(effectRunnerSource)) {
    violations.push("forbidden: central effect-runner switch");
  }
  if (/\bCOMPLETE_PASTE_READ\b/.test(eventsSource)) {
    violations.push("forbidden: paste completion in public machine event vocabulary");
  }

  assert.deepEqual(violations, []);
});

test("machine status notice vocabulary does not leak to content or tests", () => {
  const violations = [];
  const allowedFiles = new Set([
    import.meta.filename,
  ]);

  for (const filePath of [
    ...listJavaScriptFiles(SOURCE_DIR),
    ...listJavaScriptFiles(TEST_DIR),
  ]) {
    if (allowedFiles.has(filePath) || filePath.startsWith(MACHINE_DIR)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\bMACHINE_STATUS_NOTICE_KIND\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("placement planning is pure geometry and never constructs machine events", () => {
  const source = readSource(repoPath("src/core/placement-edit-planning.js"));
  const contextSource = readSource(repoPath("src/core/placement-edit-context.js"));
  const forbiddenPatterns = [
    ["machine event import", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["placement edit kind import", /\bMACHINE_PLACEMENT_EDIT_KIND\b/],
    ["planner lifecycle phase", /\bPLACEMENT_EDIT_PLAN_PHASE\b|\bphase\s*:/],
    ["planner semantic edit kind", /\bPLACEMENT_EDIT_PLAN_KIND\b|\bkind\s*:/],
    ["event payload property", /\bevent\s*:/],
    ["event type payload", /\btype:\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\./],
    ["machine state parameter", /\bstate,\s*\n\s*snapshot\b/],
    ["machine state projection", /\bmachineState\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.match(contextSource, /\bcreatePlacementEditPlanningContext\b/);
  assert.deepEqual(violations, []);
});

test("durable session schema is split from registration queries and equality keys", () => {
  const sessionSource = readSource(repoPath("src/core/session.js"));
  const forbiddenPatterns = [
    ["registration solve query", /\bresolveRegistrationSolveState\b/],
    ["registration edit constructor", /\bcreate(?:Invalidated|PlacementEdited)Registration\b/],
    ["registration diff query", /\bresolveRegistrationPinMutation\b/],
    ["durable equality key", /\bcreate(?:Session|Placement|Registration|OverlayImage)SnapshotKey\b/],
    ["session equality", /\bsessionsEqual\b|\bplacementsEqual\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(sessionSource))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("paste adapter reports clipboard facts, not machine-shaped outcomes", () => {
  const source = readSource(repoPath("src/content/paste-adapter.js"));
  const forbiddenPatterns = [
    ["status notice import", /\bMACHINE_STATUS_NOTICE_KIND\b/],
    ["placement policy import", /\bcreatePlacementTransform\b/],
    ["status-shaped outcome", /\bnoticeKind\b|\bnoticePayload\b/],
    ["placement-shaped outcome", /\bplacement\s*:/],
    ["page snapshot dependency", /\bpageAdapter\.getSnapshot\s*\(/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("paste read placement bridge stays deleted", () => {
  assert.equal(sourceFileExists(repoPath("src/content/paste-read-outcome.js")), false);
});

test("content machine host consumes paste effect services instead of clipboard adapters", () => {
  const source = readSource(repoPath("src/content/content-machine-host.js"));
  const forbiddenPatterns = [
    ["clipboard reader construction", /\bcreateClipboardImageReader\b/],
    ["deleted paste placement bridge", /\bcreatePagePlacedPasteReadOutcome\b/],
    ["clipboard API read", /\breadClipboardApiImage\b/],
    ["manual clipboard data read", /\breadClipboardDataImage\b/],
    ["manual paste listener ownership", /\baddEventListener\(\s*["']paste["']/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("content machine host consumes timer effect services instead of raw timer adapters", () => {
  const source = readSource(repoPath("src/content/content-machine-host.js"));
  const forbiddenPatterns = [
    ["raw setTimeout adapter", /\bsetTimeout\b/],
    ["raw clearTimeout adapter", /\bclearTimeout\b/],
    ["generic timer bag", /\btimers\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("content machine host consumes persistence services instead of platform storage", () => {
  const source = readSource(repoPath("src/content/content-machine-host.js"));
  const forbiddenPatterns = [
    ["platform storage construction", /\bcreateExtensionStorage\b/],
    ["storage key ownership", /\bDEFAULT_STORAGE_KEY\b/],
    ["storage load wiring", /\bstorage\.load\b/],
    ["storage save wiring", /\bstorage\.save\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("content machine host consumes an explicit service bundle and initial page context", () => {
  const source = readSource(repoPath("src/content/content-machine-host.js"));
  const forbiddenPatterns = [
    ["paste service construction", /\bcreateContentPasteEffectService\b/],
    ["timer service construction", /\bcreateContentTimerEffectService\b/],
    ["persistence service construction", /\bcreateContentPersistenceService\b/],
    ["page observation dependency", /\bpageObservation\b/],
    ["snapshot read ownership", /\bgetSnapshot\s*\(/],
    ["owner window dependency", /\bownerWindow\b/],
    ["logger dependency", /\blogger\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("initial paste placement consumes canonical page snapshot liveness", () => {
  const source = readSource(repoPath("src/content/initial-paste-placement.js"));
  const violations = [];

  if (!/\bisLivePageSnapshot\b/.test(source)) {
    violations.push("missing: canonical page snapshot liveness predicate");
  }
  if (/\bPAGE_(?:SNAPSHOT|MAP_VIEW)_PROVENANCE_KIND\b|\bprovenance\s*\.\s*(?:kind|mapView)\b/.test(source)) {
    violations.push("forbidden: local page snapshot provenance interpretation");
  }

  assert.deepEqual(violations, []);
});

test("persistence is storage-shaped and independent of live page projection", () => {
  const source = readSource(repoPath("src/core/machine/persistence.js"));
  const forbiddenPatterns = [
    ["transform dependency", /\bcreatePlacementTransform\b/],
    ["page snapshot parameter", /\bsnapshot\b/],
    ["map view dependency", /\bmapView\b/],
    ["projection migration export", /\bmigratePersistedMachineSessionForMap\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("content bootstrap does not mix persistence migration with live page snapshots", () => {
  const source = readSource(repoPath("src/content/main.js"));
  const forbiddenPatterns = [
    ["map-aware persistence migration import", /\bmigratePersistedMachineSessionForMap\b/],
    ["snapshot passed while constructing persisted session", /\bpersistedSession:\s*[^,\n]*pageAdapter\.getSnapshot\s*\(/s],
    ["storage composition", /\bcreateExtensionStorage\b|\bDEFAULT_STORAGE_KEY\b/],
    ["paste composition", /\bcreateClipboardImageReader\b|\bcreatePagePlacedPasteReadOutcome\b|\bcreateManualPasteCapture\b/],
    ["core machine construction", /\bcreateMachineHost\b/],
    ["session lifecycle internals", /\bbeforeunload\b|\bstoreActiveSession\b|\bclearActiveSession\b|\bdestroyExistingSession\b/],
    ["direct app composition", /\bcreateInteractionPorts\b|\bcreatePanel\b|\bcreateOverlay\b|\battachShadowStyles\b|\bclearOwnedShadowNodes\b|\bensureExtensionHost\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("content app delegates to the explicit content composition root", () => {
  const source = readSource(repoPath("src/content/content-app.js"));
  const forbiddenPatterns = [
    ["machine host construction", /\bcreateContentMachineHost\b/],
    ["machine service construction", /\bcreateContentMachineHostServices\b/],
    ["interaction construction", /\bcreateInteractionPorts\b/],
    ["overlay construction", /\bcreateOverlay\b/],
    ["panel construction", /\bcreatePanel\b/],
    ["shadow setup", /\battachShadowStyles\b|\bclearOwnedShadowNodes\b/],
    ["host lifecycle", /\bensureExtensionHost\b|\bdestroyActiveContentSession\b|\binstallContentSession\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  if (!/\bimport\s+\{\s*createContentComposition\s*\}/.test(source)) {
    violations.push("missing: content composition import");
  }
  if (!/\bcreateContentComposition\s*\(\s*options\s*\)\s*\.\s*start\s*\(\s*\)/.test(source)) {
    violations.push("missing: content app composition start delegation");
  }

  assert.deepEqual(violations, []);
});

test("content composition names the product dependency graph", () => {
  const source = readSource(repoPath("src/content/content-composition.js"));
  const requiredNodes = [
    "createHostNode",
    "destroyActiveSessionNode",
    "createMachineServicesNode",
    "createMachineHostNode",
    "createInteractionPortsNode",
    "createShadowShellNode",
    "createOverlayEnvironmentNode",
    "createOverlayNode",
    "createPanelNode",
    "installContentSessionNode",
  ];
  const missingNodes = requiredNodes
    .filter((nodeName) => !new RegExp(`\\bfunction\\s+${nodeName}\\b`).test(source))
    .map((nodeName) => `missing: ${nodeName}`);

  assert.deepEqual(missingNodes, []);
});

test("content entrypoint owns page-lifetime lazy bootstrap and keyboard gateway only", () => {
  const source = readSource(repoPath("src/content/content.js"));
  const keyboardGatewaySource = readSource(repoPath("src/content/keyboard-gateway.js"));
  const forbiddenPatterns = [
    ["inline keyboard gateway", /\bfunction\s+createKeyboardGateway\b/],
    ["content app import", /\bcreateContentApp\b/],
    ["page adapter import", /\bcreatePageAdapter\b/],
    ["machine host import", /\bcreateContentMachineHost\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
  ];

  if (!/\bimport\s+\{\s*createKeyboardGateway\s*\}/.test(source)) {
    violations.push("missing: keyboard gateway import");
  }
  if (!/\bdestroy\s*\(\)/.test(keyboardGatewaySource)) {
    violations.push("missing: explicit keyboard gateway destroy");
  }

  assert.deepEqual(violations, []);
});

test("page integration exposes explicit ports instead of a broad adapter object", () => {
  const source = readSource(repoPath("src/content/page-adapter.js"));
  const requiredPorts = [
    "pageSession",
    "pageObservation",
    "pageProjection",
    "mapGesture",
  ];
  const violations = [];

  for (const portName of requiredPorts) {
    if (!new RegExp(`\\b${portName}\\b`).test(source)) {
      violations.push(`missing: ${portName}`);
    }
  }
  if (!/\breturn\s*\{\s*pageSession,\s*pageObservation,\s*pageProjection,\s*mapGesture,\s*\}/s.test(source)) {
    violations.push("missing: explicit port return");
  }

  assert.deepEqual(violations, []);
});

test("page adapter centralizes failure capture in a dedicated boundary", () => {
  const source = readSource(repoPath("src/content/page-adapter.js"));
  const boundarySource = readSource(repoPath("src/content/page-adapter/boundary.js"));
  const boundedSources = new Map([
    ["src/content/page-adapter/bounded-projection.js", readSource(repoPath("src/content/page-adapter/bounded-projection.js"))],
    ["src/content/page-adapter/bounded-map-gesture.js", readSource(repoPath("src/content/page-adapter/bounded-map-gesture.js"))],
    ["src/content/page-adapter/snapshot-source.js", readSource(repoPath("src/content/page-adapter/snapshot-source.js"))],
  ]);
  const violations = [];

  if (!/\bcreatePageAdapterBoundary\b/.test(source)) {
    violations.push("missing: page adapter boundary import/use");
  }
  if (/\btry\s*\{|\bcatch\s*\(/.test(source)) {
    violations.push("forbidden: inline page adapter try/catch");
  }
  if (!/\bPage adapter boundary failed\b/.test(boundarySource)) {
    violations.push("missing: centralized adapter failure log");
  }
  if (/\bfallbackValue\b/.test(boundarySource)) {
    violations.push("forbidden: page boundary fallback parameter");
  }
  if (!/\bok:\s*true\b/.test(boundarySource) || !/\bok:\s*false\b/.test(boundarySource)) {
    violations.push("missing: typed page boundary outcome");
  }
  for (const [relativePath, boundedSource] of boundedSources) {
    if (/\brunBoundary\s*\([^)]*,[^)]*,/.test(boundedSource)) {
      violations.push(`${relativePath}: forbidden: caller-provided boundary fallback`);
    }
  }

  assert.deepEqual(violations, []);
});

test("page adapter observation graph owns page context to snapshot wiring", () => {
  const adapterSource = readSource(repoPath("src/content/page-adapter.js"));
  const graphSource = readSource(repoPath("src/content/page-adapter/observation-graph.js"));
  const contextSource = readSource(repoPath("src/content/page-adapter/page-context.js"));
  const violations = [];

  if (!/\bcreatePageObservationGraph\b/.test(adapterSource)) {
    violations.push("missing: page observation graph composition");
  }
  if (/\bnotifySnapshotChanged\b|\bhandleStructureMutation\s*=\s*\(\)/.test(adapterSource)) {
    violations.push("forbidden: late-bound page observation callbacks");
  }
  if (!/\bPAGE_CONTEXT_EVENT\b/.test(contextSource)) {
    violations.push("missing: typed page context events");
  }
  if (!/\bpageContext\.subscribe\b/.test(graphSource)) {
    violations.push("missing: explicit page context event subscription");
  }
  if (!/\bsnapshotSource\.notifyIfChanged\b/.test(graphSource)) {
    violations.push("missing: snapshot invalidation routing");
  }
  if (!/\bviewportGeometry\.refreshViewportElement\b/.test(graphSource)) {
    violations.push("missing: structure mutation routing");
  }
  if (!/\bviewportGeometry\.clearViewportElement\b/.test(graphSource)) {
    violations.push("missing: viewport retarget routing");
  }
  if (!/\bpageContext\.syncObservedContext\b/.test(graphSource)) {
    violations.push("missing: graph-owned context retarget sync");
  }

  assert.deepEqual(violations, []);
});

test("page projection math uses explicit projection facts", () => {
  const source = readSource(repoPath("src/content/page-adapter/projection.js"));
  const adapterSource = readSource(repoPath("src/content/page-adapter.js"));
  const boundedSource = readSource(repoPath("src/content/page-adapter/bounded-projection.js"));
  const factsSource = readSource(repoPath("src/content/page-adapter/projection-facts.js"));
  const violations = [];

  if (!/\bcreateSnapshotProjectionFacts\b/.test(source)) {
    violations.push("missing: projection fact construction");
  }
  if (/\bfunction\s+createProjectionContext\b/.test(source)) {
    violations.push("forbidden: local projection context reconstruction");
  }
  if (/\bprojectLatLonToWorld\b|\bunprojectWorldToLatLon\b/.test(source)) {
    violations.push("forbidden: low-level map projection math in live port");
  }
  if (!/\bprojectMapPointToBaseScreenPoint\b/.test(factsSource)) {
    violations.push("missing: base-screen projection helper");
  }
  if (!/\bunprojectBaseScreenPointToMap\b/.test(factsSource)) {
    violations.push("missing: base-screen unprojection helper");
  }
  if (!/\bcreateBoundedPageProjection\b/.test(adapterSource)) {
    violations.push("missing: bounded projection port");
  }
  if (/\bclient-point-to-screen\b|\bmap-to-screen\b|\bscreen-to-map\b/.test(adapterSource)) {
    violations.push("forbidden: projection boundary policy in page adapter root");
  }
  if (!/\bclient-point-to-screen\b|\bmap-to-screen\b|\bscreen-to-map\b/.test(boundedSource)) {
    violations.push("missing: centralized projection boundary policy");
  }

  assert.deepEqual(violations, []);
});

test("page context delegates navigation observation instead of owning listeners inline", () => {
  const source = readSource(repoPath("src/content/page-adapter/page-context.js"));
  const activeContextSource = readSource(repoPath("src/content/page-adapter/active-map-context.js"));
  const navigationSource = readSource(repoPath("src/content/page-adapter/navigation-observation.js"));
  const historySource = readSource(repoPath("src/content/page-adapter/history-observation.js"));
  const violations = [];

  if (!/\bcreateActiveMapContextResolver\b/.test(source)) {
    violations.push("missing: active map-context delegation");
  }
  if (/\bfindEmbeddedIdFrame\b|\bgetSafeLocation\b/.test(source)) {
    violations.push("forbidden: active map-context selection in observer coordinator");
  }
  if (!/\bfindEmbeddedIdFrame\b/.test(activeContextSource)) {
    violations.push("missing: active map-context iframe selection");
  }
  if (!/\bcreatePageNavigationObservation\b/.test(source)) {
    violations.push("missing: navigation observation delegation");
  }
  if (/\bobserveHistoryMutations\b|\b(?:add|remove)EventListener\s*\(\s*["'](?:hashchange|popstate)["']/.test(source)) {
    violations.push("forbidden: inline navigation observation ownership");
  }
  if (!/\bobserveHistoryMutations\b/.test(navigationSource)) {
    violations.push("missing: navigation observer history delegation");
  }
  if (/\bhistory\.(?:replaceState|pushState)\s*=/.test(source)) {
    violations.push("forbidden: inline history monkey-patching");
  }
  if (!/\bhistory\.(?:replaceState|pushState)\s*=/.test(historySource)) {
    violations.push("missing: quarantined history method patch");
  }

  assert.deepEqual(violations, []);
});

test("page context delegates mutation observer ownership", () => {
  const source = readSource(repoPath("src/content/page-adapter/page-context.js"));
  const observationSource = readSource(repoPath("src/content/page-adapter/mutation-observation.js"));
  const violations = [];

  if (!/\bcreatePageMutationObservation\b/.test(source)) {
    violations.push("missing: mutation observer delegation");
  }
  if (/\bnew\s+MutationObserver\b|\bmutationObserver\b|\bobservedMutationRoot\b|\.observe\s*\(/.test(source)) {
    violations.push("forbidden: inline mutation observer ownership");
  }
  if (!/\bMutationObserverCtor\b/.test(observationSource)) {
    violations.push("missing: quarantined MutationObserver adapter");
  }
  if (!/\battributeFilter:\s*Object\.freeze\(\["class", "style", "src"\]\)/.test(observationSource)) {
    violations.push("missing: canonical page mutation filter");
  }

  assert.deepEqual(violations, []);
});

test("page observation graph owns snapshot scheduling and source lifecycle hooks", () => {
  const graphSource = readSource(repoPath("src/content/page-adapter/observation-graph.js"));
  const source = readSource(repoPath("src/content/page-adapter/snapshot-source.js"));
  const watcherSource = readSource(repoPath("src/content/page-adapter/snapshot-watcher.js"));
  const violations = [];

  if (!/\bcreatePageSnapshotWatcher\b/.test(graphSource)) {
    violations.push("missing: graph-owned snapshot watcher");
  }
  if (!/\bonFirstSubscriber:\s*startObserving\b/.test(graphSource)) {
    violations.push("missing: graph-owned observation start hook");
  }
  if (!/\bonNoSubscribers:\s*stopObserving\b/.test(graphSource)) {
    violations.push("missing: graph-owned observation stop hook");
  }
  if (/\bcreatePageSnapshotWatcher\b|\bsyncObservedContext\b/.test(source)) {
    violations.push("forbidden: snapshot source owns observation or retarget policy");
  }
  if (/\brequestAnimationFrame\b|\bsetInterval\b|\baddEventListener\b/.test(source)) {
    violations.push("forbidden: scheduling/listener policy in snapshot source");
  }
  if (!/\bonInvalidate\b/.test(watcherSource) || /\bPAGE_SNAPSHOT_OBSERVATION_CAUSE\b|\bonChange\b/.test(watcherSource)) {
    violations.push("forbidden: snapshot watcher exposes semantic causes instead of invalidation");
  }
  if (!/\brequestAnimationFrame\b|\bsetInterval\b/.test(watcherSource)) {
    violations.push("missing: watcher polling policy");
  }
  if (!/\baddEventListener\b/.test(watcherSource)) {
    violations.push("missing: watcher event subscription policy");
  }

  assert.deepEqual(violations, []);
});

test("page snapshot shape and equality are centralized outside the snapshot source", () => {
  const source = readSource(repoPath("src/content/page-adapter/snapshot-source.js"));
  const readerSource = readSource(repoPath("src/content/page-adapter/snapshot-reader.js"));
  const streamSource = readSource(repoPath("src/content/page-adapter/snapshot-stream.js"));
  const snapshotSource = readSource(repoPath("src/content/page-adapter/page-snapshot.js"));
  const violations = [];

  if (!/\bcreatePageSnapshotReader\b/.test(source)) {
    violations.push("missing: delegated page snapshot reader");
  }
  if (!/\bcreatePageSnapshotStream\b/.test(source)) {
    violations.push("missing: delegated page snapshot stream");
  }
  if (/\bcreatePageSnapshot\b|\bcreateStalePageSnapshot\b|\bcreateFallbackPageSnapshot\b/.test(source)) {
    violations.push("forbidden: snapshot construction in source lifecycle");
  }
  if (!/\bcreatePageSnapshot\b/.test(readerSource)) {
    violations.push("missing: page snapshot factory");
  }
  if (/\bpageSnapshotsEqual\b/.test(source)) {
    violations.push("forbidden: snapshot equality in source lifecycle");
  }
  if (!/\bpageSnapshotsEqual\b/.test(streamSource)) {
    violations.push("missing: page snapshot equality helper");
  }
  if (/\bfunction\s+(?:createSnapshot|snapshotsEqual)\b/.test(source)) {
    violations.push("forbidden: local snapshot shape/equality");
  }
  if (!/\bfunction\s+rectsEqual\b/.test(snapshotSource)) {
    violations.push("missing: centralized rect equality");
  }
  if (!/\bPAGE_SNAPSHOT_PROVENANCE_KIND\b/.test(snapshotSource)) {
    violations.push("missing: page snapshot provenance vocabulary");
  }
  if (!/\bPAGE_VIEWPORT_PROVENANCE_KIND\b/.test(snapshotSource)) {
    violations.push("missing: viewport provenance vocabulary");
  }
  if (!/\bPAGE_MAP_VIEW_PROVENANCE_KIND\b/.test(snapshotSource)) {
    violations.push("missing: map-view provenance vocabulary");
  }
  if (!/\bviewportProvenance\b/.test(readerSource)) {
    violations.push("missing: viewport provenance propagation");
  }
  if (!/\bmapViewProvenance\b/.test(readerSource)) {
    violations.push("missing: map-view provenance propagation");
  }
  if (!/\bcreateStalePageSnapshot\b/.test(readerSource)) {
    violations.push("missing: stale fallback provenance");
  }

  assert.deepEqual(violations, []);
});

test("obsolete page-adapter seam files stay deleted", () => {
  const obsoleteFiles = [
    "src/content/page-adapter/forwarded-map-events.js",
    "src/content/page-adapter/map-gesture-targets.js",
    "src/content/page-adapter/map-view-facts.js",
    "src/content/page-adapter/page-dom-queries.js",
    "src/content/page-adapter/viewport-element-resolver.js",
  ];

  assert.deepEqual(
    obsoleteFiles.filter((filePath) => sourceFileExists(repoPath(filePath))),
    [],
  );
});

test("map view resolver delegates tile and hash fact extraction", () => {
  const source = readSource(repoPath("src/content/page-adapter/map-view.js"));
  const upstreamMapViewSource = readSource(repoPath("src/content/page-adapter/upstream-map-view.js"));
  const hashSource = readSource(repoPath("src/content/page-adapter/map-hash-view.js"));
  const tileTransformSource = readSource(repoPath("src/content/page-adapter/map-tile-transform.js"));
  const tileUrlSource = readSource(repoPath("src/content/page-adapter/map-tile-url.js"));
  const violations = [];

  if (!/\bderiveTileMapView\b/.test(source)) {
    violations.push("missing: tile map-view fact delegation");
  }
  if (!/\bderiveHashMapView\b/.test(source)) {
    violations.push("missing: hash map-view fact delegation");
  }
  if (!/\bPAGE_MAP_VIEW_PROVENANCE_KIND\b/.test(source)) {
    violations.push("missing: map-view provenance policy");
  }
  if (/\bunprojectWorldToLatLon\b|\bfindReferenceTile\b|\bparseTileCoordinates\b|\bquadkeyToTileCoordinates\b/.test(source)) {
    violations.push("forbidden: low-level map-view fact extraction in resolver");
  }
  if (!/\bderiveHashMapView\b/.test(upstreamMapViewSource)) {
    violations.push("missing: nullable hash map-view derivation");
  }
  if (!/\bparseTileCoordinates\b/.test(upstreamMapViewSource) || !/\bparseTileMatrixTransform\b/.test(upstreamMapViewSource)) {
    violations.push("missing: delegated tile parser use in upstream map-view adapter");
  }
  if (/\bquadkeyToTileCoordinates\b|\bmatrix\(|\bgetComputedStyle\b|\bmap=/.test(upstreamMapViewSource)) {
    violations.push("forbidden: low-level tile/hash parsing in upstream map-view adapter");
  }
  if (!/\bmap=/.test(hashSource)) {
    violations.push("missing: hash parser owns map hash shape");
  }
  if (!/matrix\\\(/.test(tileTransformSource) || !/\bgetComputedStyle\b/.test(tileTransformSource)) {
    violations.push("missing: tile transform parser owns CSS matrix parsing");
  }
  if (!/\bquadkeyToTileCoordinates\b/.test(tileUrlSource)) {
    violations.push("missing: Bing quadkey parsing in tile URL parser");
  }

  assert.deepEqual(violations, []);
});

test("viewport geometry resolver delegates geometry and surface-motion fact construction", () => {
  const source = readSource(repoPath("src/content/page-adapter/viewport-geometry.js"));
  const upstreamViewportSource = readSource(repoPath("src/content/page-adapter/upstream-viewport.js"));
  const factsSource = readSource(repoPath("src/content/page-adapter/viewport-geometry-facts.js"));
  const violations = [];

  if (!/\bcreateElementViewportGeometry\b/.test(source)) {
    violations.push("missing: element geometry fact delegation");
  }
  if (!/\bcreateFallbackViewportGeometry\b/.test(source)) {
    violations.push("missing: fallback geometry fact delegation");
  }
  if (!/\bresolveSurfaceMotionFact\b/.test(source)) {
    violations.push("missing: surface motion fact delegation");
  }
  if (!/\bcreateViewportElementResolver\b/.test(source)) {
    violations.push("missing: viewport element identity delegation");
  }
  if (/\bgetBoundingClientRect\b|\bcreateWindowViewportRect\b|\bSURFACE_MOTION_SELECTOR\b|\bfindViewportElement\b|\bisVisible\b|\blet\s+viewportElement\b/.test(source)) {
    violations.push("forbidden: low-level viewport fact or identity extraction in resolver");
  }
  if (!/\btranslateRectByFrame\b/.test(factsSource)) {
    violations.push("missing: framed viewport translation in facts module");
  }
  if (!/\bPAGE_VIEWPORT_PROVENANCE_KIND\b/.test(factsSource)) {
    violations.push("missing: viewport fact provenance");
  }
  if (/\bSURFACE_MOTION_SELECTOR\b|\bfindViewportElement\b|\bisVisible\b|\blet\s+viewportElement\b/.test(factsSource)) {
    violations.push("forbidden: upstream viewport inference in geometry facts");
  }
  if (!/\bfindViewportElement\b/.test(upstreamViewportSource) || !/\bisVisible\b/.test(upstreamViewportSource)) {
    violations.push("missing: upstream viewport element identity/cache policy");
  }
  if (!/\bSURFACE_MOTION_SELECTOR\b/.test(upstreamViewportSource)) {
    violations.push("missing: upstream surface-motion selector inference");
  }

  assert.deepEqual(violations, []);
});

test("generic page adapter DOM helpers do not own upstream page selectors", () => {
  const domSource = readSource(repoPath("src/content/page-adapter/dom.js"));
  const upstreamDomSource = readSource(repoPath("src/content/page-adapter/upstream-dom.js"));
  const violations = [];

  if (/\bquerySelector\b|\bquerySelectorAll\b|\bVIEWPORT_SELECTORS\b|\bID_EMBED_SELECTOR\b/.test(domSource)) {
    violations.push("forbidden: upstream page selector queries in generic DOM helpers");
  }
  if (!/\bVIEWPORT_SELECTORS\b/.test(upstreamDomSource)) {
    violations.push("missing: upstream viewport selector quarantine");
  }
  if (!/\bfindEmbeddedIdFrame\b/.test(upstreamDomSource)) {
    violations.push("missing: upstream embedded iD frame query");
  }
  if (!/\bfindReferenceTile\b/.test(upstreamDomSource)) {
    violations.push("missing: upstream reference tile query");
  }

  assert.deepEqual(violations, []);
});

test("gesture forwarding delegates synthetic event construction and identity", () => {
  const adapterSource = readSource(repoPath("src/content/page-adapter.js"));
  const boundedSource = readSource(repoPath("src/content/page-adapter/bounded-map-gesture.js"));
  const source = readSource(repoPath("src/content/page-adapter/gesture-forwarding.js"));
  const mapPanDragSource = readSource(repoPath("src/content/interactions/map-pan-drag.js"));
  const transportSource = readSource(repoPath("src/content/page-adapter/upstream-gesture-transport.js"));
  const factSource = readSource(repoPath("src/content/page-adapter/map-gesture-facts.js"));
  const targetSource = readSource(repoPath("src/content/page-adapter/upstream-gesture-targets.js"));
  const violations = [];

  if (!/\bdispatchForwardedMapPointerPhase\b/.test(source)) {
    violations.push("missing: pointer event forwarding delegation");
  }
  if (!/\bdispatchForwardedMapWheel\b/.test(source)) {
    violations.push("missing: wheel event forwarding delegation");
  }
  if (/\bnew\s+context\.mapWindow\.(?:PointerEvent|MouseEvent|WheelEvent)\b|\bObject\.defineProperty\s*\(/.test(source)) {
    violations.push("forbidden: synthetic event construction in gesture coordinator");
  }
  if (!/\bFORWARDED_MAP_GESTURE_EVENT_FLAG\b/.test(transportSource)) {
    violations.push("missing: forwarded event identity owner");
  }
  if (!/\bnew\s+context\.mapWindow\.(?:PointerEvent|MouseEvent|WheelEvent)\b/.test(transportSource)) {
    violations.push("missing: upstream synthetic gesture event transport");
  }
  if (!/\bresolveMapZoomGestureFacts\b/.test(source) || !/\bresolveMapPanGestureFacts\b/.test(source)) {
    violations.push("missing: gesture fact resolution delegation");
  }
  if (/\bresolveMapZoomTarget\b|\bresolveMapPanTarget\b|\bscreenPointToContextClientPoint\b|\bfindViewportElement\b|\bisOverlayOwnedElement\b|\belementsFromPoint\b|\belementFromPoint\b/.test(source)) {
    violations.push("forbidden: projection or DOM target resolution in gesture coordinator");
  }
  if (!/\bscreenPointToContextClientPoint\b/.test(factSource)) {
    violations.push("missing: gesture facts own screen-to-client projection");
  }
  if (!/\bresolveMapZoomTarget\b/.test(factSource) || !/\bresolveMapPanTarget\b/.test(factSource)) {
    violations.push("missing: gesture facts own target policy delegation");
  }
  if (/\bfindViewportElement\b|\bisOverlayOwnedElement\b|\belementsFromPoint\b|\belementFromPoint\b/.test(factSource)) {
    violations.push("forbidden: DOM target resolution in gesture facts");
  }
  if (!/\belementsFromPoint\b/.test(targetSource) || !/\bisOverlayOwnedElement\b/.test(targetSource)) {
    violations.push("missing: quarantined map target hit-testing");
  }
  if (!/\bcreateBoundedMapGesturePort\b/.test(adapterSource)) {
    violations.push("missing: bounded map gesture port");
  }
  if (/\bbegin-map-pan\b|\bforward-map-zoom\b/.test(adapterSource)) {
    violations.push("forbidden: map gesture boundary policy in page adapter root");
  }
  if (!/\bbegin-map-pan\b|\bforward-map-zoom\b/.test(boundedSource)) {
    violations.push("missing: centralized map gesture boundary policy");
  }
  if (/\bupdateMapPan\b|\bendMapPan\b/.test(boundedSource)) {
    violations.push("forbidden: split map-pan lifecycle methods on page port");
  }
  if (!/\bmove\s*\(\s*screenPoint\s*\)/.test(boundedSource) || !/\bfinish\s*\(\s*screenPoint\s*\)/.test(boundedSource)) {
    violations.push("missing: bounded map-pan session methods");
  }
  if (/\bactiveMapPan\b/.test(source)) {
    violations.push("forbidden: page adapter owns hidden map-pan session state");
  }
  if (/\bactive\s*=\s*(?:true|false)\b/.test(mapPanDragSource)) {
    violations.push("forbidden: interaction map-pan controller duplicates session state as a boolean");
  }

  assert.deepEqual(violations, []);
});

test("content modules consume narrow page ports, not the monolithic adapter", () => {
  const violations = [];
  const allowedFiles = new Set([
    repoPath("src/content/page-adapter.js"),
    repoPath("src/content/main.js"),
  ]);

  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    if (allowedFiles.has(filePath) || filePath.includes(`${path.sep}page-adapter${path.sep}`)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\bpageAdapter\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("overlay renderer is a pure render reconciler over an overlay view model", () => {
  const source = readSource(repoPath("src/content/overlay/renderer.js"));
  const forbiddenPatterns = [
    ["machine selector import", /\bselectOverlayPresentation\b/],
    ["page adapter dependency", /\bpageAdapter\b/],
    ["machine state accessor", /\bgetMachineState\b/],
    ["runtime state accessor", /\bgetRuntimeState\b/],
    ["session state local", /\bconst\s+state\s*=\s*machineState\.session\b/],
    ["map projection call", /\bmapToOverlayLayerScreen\s*\(/],
  ];
  const requiredPatterns = [
    ["overlay view model input", /\boverlayView\b|\bviewModel\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("overlay composition consumes one state source for render and input facts", () => {
  const source = readSource(repoPath("src/content/overlay.js"));
  const stateSource = readSource(repoPath("src/content/overlay/state-source.js"));
  const presentationSource = readSource(repoPath("src/content/overlay/presentation.js"));
  const invalidationSource = readSource(repoPath("src/content/overlay/invalidation.js"));
  const forbiddenPatterns = [
    ["local snapshot cache", /\blatestSnapshot\b/],
    ["local runtime cache", /\blatestRuntime\b/],
    ["view model construction in overlay composition", /\bbuildOverlayViewModel\b/],
    ["direct page observation subscription", /\bpageObservation\.subscribe\b/],
    ["direct runtime subscription", /\boverlayInteractions\.subscribeRuntime\b/],
    ["direct machine subscription", /\bmachineHost\.subscribe\b/],
    ["split runtime change callback", /\bonRuntimeChange\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
  ];

  if (!/\bcreateOverlayStateSource\b/.test(source)) {
    violations.push("missing: overlay state source");
  }
  if (!/\bOVERLAY_INVALIDATION_SOURCE\b/.test(source) || !/\bOVERLAY_INVALIDATION_SOURCE\b/.test(stateSource)) {
    violations.push("missing: typed overlay invalidation source");
  }
  if (!/\bMACHINE\b/.test(invalidationSource) || !/\bPAGE\b/.test(invalidationSource) || !/\bRUNTIME\b/.test(invalidationSource)) {
    violations.push("missing: canonical overlay invalidation vocabulary");
  }
  if (/\bbuildOverlayViewModel\b/.test(stateSource)) {
    violations.push("forbidden: view model construction in overlay state source");
  }
  if (!/\bbuildOverlayPresentation\b/.test(stateSource)) {
    violations.push("missing: delegated overlay presentation construction");
  }
  if (!/\bbuildOverlayViewModel\b/.test(presentationSource)) {
    violations.push("missing: centralized overlay view model construction");
  }
  if ((presentationSource.match(/\bbuildOverlayViewModel\s*\(/g) ?? []).length !== 1) {
    violations.push("forbidden: multiple overlay view model construction sites");
  }
  if (!/\bpresentation\b/.test(stateSource)) {
    violations.push("missing: canonical overlay presentation cache");
  }
  if (/\bfunction\s+getOverlayInputContext\s*\([^)]*\)\s*\{[^}]*\bbuildOverlayViewModel\s*\(/s.test(stateSource)) {
    violations.push("forbidden: input context rebuilds overlay view model");
  }

  assert.deepEqual(violations, []);
});

test("overlay composition receives one explicit environment object", () => {
  const source = readSource(repoPath("src/content/overlay.js"));
  const compositionSource = readSource(repoPath("src/content/content-composition.js"));
  const violations = [];

  if (!/\bexport\s+function\s+createOverlay\s*\(\s*\{\s*environment\s*,?\s*\}/s.test(source)) {
    violations.push("missing: overlay environment parameter");
  }
  if (/\bexport\s+function\s+createOverlay\s*\(\s*\{\s*(?:pageObservation|pageProjection|isForwardedMapGestureEvent|machineHost|overlayInteractions)\b/s.test(source)) {
    violations.push("forbidden: exploded overlay constructor parameters");
  }
  if (!/\bcreateOverlayEnvironment\s*\(\s*\{[^}]*\bpagePorts\b[^}]*\bmachineHost\b[^}]*\boverlayInteractions\b/s.test(compositionSource)) {
    violations.push("missing: composition-owned overlay environment construction");
  }
  if (!/\bcreateOverlay\s*\(\s*\{\s*environment:\s*overlayEnvironment\s*,?\s*\}/s.test(compositionSource)) {
    violations.push("missing: overlay receives environment only");
  }

  assert.deepEqual(violations, []);
});

test("only machine internals import machine event vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(SOURCE_DIR)) {
    if (filePath.startsWith(MACHINE_DIR)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("runtime observations enter through explicit host methods, not content-authored machine facts", () => {
  const sources = new Map([
    ["src/content/interactions/runtime-bridge.js", readSource(repoPath("src/content/interactions/runtime-bridge.js"))],
    ["src/content/interactions/runtime-observation.js", readSource(repoPath("src/content/interactions/runtime-observation.js"))],
    ["src/content/interactions/pointer-interaction.js", readSource(repoPath("src/content/interactions/pointer-interaction.js"))],
    ["src/content/interactions/keyboard-router.js", readSource(repoPath("src/content/interactions/keyboard-router.js"))],
    ["src/core/machine/host.js", readSource(repoPath("src/core/machine/host.js"))],
  ]);
  const bridgeSource = sources.get("src/content/interactions/runtime-bridge.js");
  const hostSource = sources.get("src/core/machine/host.js");
  const forbiddenPatterns = [
    ["runtime update command", /\bupdatePointer\b|\bUPDATE_POINTER_RUNTIME\b/],
    ["gesture mutation command", /\bbeginGesture\b|\bendGesture\b|\bBEGIN_POINTER_GESTURE\b|\bEND_POINTER_GESTURE\b/],
    ["pass-through mutation command", /\bsetPassThrough\b|\bSET_INPUT_OVERRIDE\b/],
    ["reset mutation command", /\bresetInteractionState\b|\bRESET_INPUT_RUNTIME\b/],
    ["generic runtime fact ingress", /\bobserveRuntimeFact\b/],
  ];
  const violations = [];

  for (const [relativePath, source] of sources) {
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${name}`);
      }
    }
  }
  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    const source = readSource(filePath);
    if (source.includes("/machine/runtime-facts.js") || source.includes("../../core/machine/runtime-facts.js")) {
      violations.push(`${path.relative(repoPath(), filePath)}: machine runtime fact import`);
    }
  }
  if (sourceFileExists(repoPath("src/content/interactions/runtime-fact-port.js"))) {
    violations.push("forbidden: content runtime fact port");
  }
  for (const methodName of [
    "observePointer",
    "clearPointer",
    "observeGestureStart",
    "observeGestureMove",
    "observeGestureFinish",
    "observeInputInterrupted",
    "observePassThroughPress",
    "observePassThroughRelease",
  ]) {
    if (!new RegExp(`\\b${methodName}\\b`).test(hostSource)) {
      violations.push(`missing host input-runtime ingress: ${methodName}`);
    }
    if (!new RegExp(`\\bruntimeActions\\.${methodName}\\b`).test(bridgeSource)) {
      violations.push(`missing bridge runtime action: ${methodName}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("interaction and overlay failure recovery use typed boundary methods", () => {
  const interactionBoundarySource = readSource(repoPath("src/content/interactions/error-boundary.js"));
  const interactionSources = new Map([
    ["src/content/interactions/pointer-interaction.js", readSource(repoPath("src/content/interactions/pointer-interaction.js"))],
    ["src/content/interactions/pin-toggle-interaction.js", readSource(repoPath("src/content/interactions/pin-toggle-interaction.js"))],
    ["src/content/interactions/wheel-interaction.js", readSource(repoPath("src/content/interactions/wheel-interaction.js"))],
    ["src/content/interaction-ports.js", readSource(repoPath("src/content/interaction-ports.js"))],
    ["src/content/overlay/event-boundary.js", readSource(repoPath("src/content/overlay/event-boundary.js"))],
  ]);
  const violations = [];

  if (!/\brunHandledInteraction\b/.test(interactionBoundarySource)) {
    violations.push("missing: handled interaction recovery helper");
  }
  if (!/\brecoverFromFailure\b/.test(interactionBoundarySource)) {
    violations.push("missing: explicit recovery helper");
  }
  if (!/\breportFailure\b/.test(interactionBoundarySource)) {
    violations.push("missing: report-only failure helper");
  }
  if (/\bfallbackValue\b/.test(interactionBoundarySource)) {
    violations.push("forbidden: interaction fallback value parameter");
  }
  if (/\bresetInteraction\s*=/.test(interactionBoundarySource)) {
    violations.push("forbidden: caller-selected interaction reset default");
  }

  for (const [relativePath, source] of interactionSources) {
    if (/\berrorBoundary\.run\s*\(/.test(source)) {
      violations.push(`${relativePath}: forbidden: generic interaction boundary run`);
    }
    if (/\berrorBoundary\.report\s*\(/.test(source)) {
      violations.push(`${relativePath}: forbidden: generic interaction boundary report`);
    }
    if (/\bfallbackValue\b/.test(source)) {
      violations.push(`${relativePath}: forbidden: caller fallback value`);
    }
    if (/\bresetInteraction\b/.test(source)) {
      violations.push(`${relativePath}: forbidden: caller reset flag`);
    }
  }

  assert.deepEqual(violations, []);
});

test("core input policy consumes normalized facts, never DOM event shape", () => {
  const sources = new Map([
    ["src/core/machine/policy.js", readSource(repoPath("src/core/machine/policy.js"))],
    ["src/core/interaction-policy.js", readSource(repoPath("src/core/interaction-policy.js"))],
    ["src/core/input-projection.js", readSource(repoPath("src/core/input-projection.js"))],
  ]);
  const forbiddenPatterns = [
    ["event code access", /\bevent\?*\.code\b|\bevent\.code\b/],
    ["DOM keyboard code literal", /["']Space["']/],
    ["modifier-key DOM shape", /\b(?:ctrlKey|metaKey|shiftKey|altKey)\b/],
    ["DOM target shape", /\b(?:target|activeElement)\b/],
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

test("tests exercise public ingress instead of raw mutation events", () => {
  const violations = [];
  const forbiddenPatterns = [
    ["raw machine event vocabulary", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
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

test("test harnesses exercise typed page ports instead of recreating a broad adapter", () => {
  const violations = [];
  const forbiddenPatterns = [
    ["broad page adapter fixture", /\bpageAdapter\b/],
    ["flattened page ports", /\bflattenPagePorts\b/],
    ["adapter-to-port bridge", /\bpagePortsFromAdapter\b/],
    ["legacy static page adapter", /\bcreateStaticOverlayPageAdapter\b/],
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

test("test vocabulary names page dependencies by typed port outside page-adapter suites", () => {
  const violations = [];
  const excludedPathFragments = [
    `${path.sep}contracts${path.sep}`,
    `${path.sep}page-adapter`,
  ];
  const forbiddenPatterns = [
    ["broad page adapter wording", /\bpage adapter\b/i],
    ["adapter-sourced fact wording", /\badapter-(?:derived|sourced)\b/i],
    ["adapter facts wording", /\badapter facts\b/i],
  ];

  for (const filePath of listJavaScriptFiles(TEST_DIR)) {
    if (excludedPathFragments.some((fragment) => filePath.includes(fragment))) {
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

test("test suite has no skipped, focused, or placeholder tests", () => {
  const violations = [];
  const forbiddenPatterns = [
    ["skipped test", /\b(?:test|describe)\.skip\s*\(/],
    ["focused test", /\b(?:test|describe)\.only\s*\(/],
    ["placeholder test", /\b(?:test|describe)\.todo\s*\(/],
    ["todo option", /\btodo\s*:\s*true\b/],
    ["skip option", /\bskip\s*:\s*true\b/],
  ];

  for (const filePath of listJavaScriptFiles(TEST_DIR)) {
    const source = readSource(filePath);
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(formatViolation(filePath, name));
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("test names are unique across the suite", () => {
  const seen = new Map();
  const violations = [];

  for (const filePath of listJavaScriptFiles(TEST_DIR)) {
    const relativePath = path.relative(repoPath(), filePath);
    for (const testName of listTestNames(readSource(filePath))) {
      const firstPath = seen.get(testName);
      if (firstPath) {
        violations.push(`${testName}: ${firstPath}, ${relativePath}`);
      } else {
        seen.set(testName, relativePath);
      }
    }
  }

  assert.deepEqual(violations, []);
});
