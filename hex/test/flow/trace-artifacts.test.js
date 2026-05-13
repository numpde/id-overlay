import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const EXPECTED_TRACE_DIR = path.join(REPO_ROOT, ".tmp", "flow-traces");

const REQUIRED_FIELDS = Object.freeze(["file", "test", "from", "to"]);
const OPTIONAL_FIELDS = Object.freeze(["phase", "provider", "terminal"]);
const FIELD_ORDER = Object.freeze([
  ...REQUIRED_FIELDS,
  ...OPTIONAL_FIELDS,
]);
const NODE_PATTERN = /^(callback|check|command|effect|inert|port|sink|source|view)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const LABEL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WITNESS_FILE_PATTERN = /^hex\/test\/.+\.flow-witness\.test\.js$/u;
const ARTIFACT_FILE_PATTERN = /^[1-9][0-9]*\.jsonl$/u;

const ALLOWED_TRANSITIONS = Object.freeze({
  callback: new Set(["command", "inert", "port", "sink"]),
  check: new Set(["command", "sink"]),
  command: new Set(["effect", "inert", "sink"]),
  effect: new Set(["port"]),
  port: new Set(["callback", "sink"]),
  source: new Set(["callback", "command", "inert", "port", "sink"]),
  view: new Set(["sink"]),
});

test("flow trace artifacts follow the witness graph convention", () => {
  const traceDir = requiredTraceDir();
  const records = readTraceArtifacts(traceDir);
  const violations = [];

  auditArtifactIdentity(records, violations);
  auditDuplicateRecords(records, violations);
  auditPhaseDisambiguation(records, violations);
  auditGraphShape(records, violations);
  auditGraphReachability(records, violations);

  violations.sort();
  assert.deepEqual(violations, []);
});

function readTraceArtifacts(traceDir) {
  const stat = readStat(traceDir);
  assert.equal(stat.isDirectory(), true, `not a directory: ${traceDir}`);

  const entries = fs.readdirSync(traceDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  assert.notEqual(entries.length, 0, `no trace artifacts in ${traceDir}`);

  const records = [];
  for (const entry of entries) {
    const filePath = path.join(traceDir, entry.name);
    assert.equal(entry.isFile(), true, `${filePath}: trace artifact must be a file`);
    assert.match(entry.name, ARTIFACT_FILE_PATTERN, `${filePath}: trace artifact must be a pid-named JSONL file`);

    const content = fs.readFileSync(filePath, "utf8");
    assert.notEqual(content, "", `${filePath}: empty trace artifact`);
    assert.equal(content.endsWith("\n"), true, `${filePath}: JSONL artifact must end with newline`);

    const lines = content.split(/\r?\n/u);
    const artifactWitnessFiles = new Set();
    let fileRecordCount = 0;
    for (const [index, line] of lines.entries()) {
      if (line.length === 0) {
        if (index === lines.length - 1) {
          continue;
        }
        assert.fail(`${filePath}:${index + 1}: blank JSONL lines are not allowed`);
      }

      const locator = `${filePath}:${index + 1}`;
      const record = parseJson(line, locator);
      auditRecordShape(record, locator);
      artifactWitnessFiles.add(record.file);
      records.push({
        artifact: filePath,
        locator,
        record,
      });
      fileRecordCount += 1;
    }

    assert.notEqual(fileRecordCount, 0, `${filePath}: no JSONL trace records`);
    assert.equal(
      artifactWitnessFiles.size,
      1,
      `${filePath}: trace artifact must contain records for exactly one witness file; saw ${[...artifactWitnessFiles].sort().join(", ")}`,
    );
  }

  assert.notEqual(records.length, 0, `no JSONL trace records in ${traceDir}`);
  return records;
}

function auditRecordShape(record, locator) {
  assertPlainObject(record, locator);

  for (const field of REQUIRED_FIELDS) {
    assertNonEmptyString(record[field], locator, field);
  }

  const expectedFields = [
    ...FIELD_ORDER.filter((field) => Object.hasOwn(record, field)),
  ];
  assert.deepEqual(
    Object.keys(record),
    expectedFields,
    `${locator}: trace record fields must be ordered and known`,
  );

  if (!WITNESS_FILE_PATTERN.test(record.file)) {
    assert.fail(`${locator}: file must name a trace-emitting witness test`);
  }
  if (path.isAbsolute(record.file) || record.file.includes("\\") || record.file.includes("..")) {
    assert.fail(`${locator}: file must be a normalized repo-relative path`);
  }

  assertNode(record.from, locator, "from");
  assertNode(record.to, locator, "to");

  const hasProvider = Object.hasOwn(record, "provider");
  const hasTerminal = Object.hasOwn(record, "terminal");
  if (hasProvider === hasTerminal) {
    assert.fail(`${locator}: edge must have exactly one of provider or terminal`);
  }

  if (hasProvider) {
    assertLabel(record.provider, locator, "provider");
  }
  if (hasTerminal) {
    assertLabel(record.terminal, locator, "terminal");
  }
  if (Object.hasOwn(record, "phase")) {
    assertLabel(record.phase, locator, "phase");
  }

  auditEdgeTransition(record, locator);
  auditProviderOrTerminal(record, locator);
}

function auditEdgeTransition(record, locator) {
  const fromKind = nodeKind(record.from);
  const toKind = nodeKind(record.to);
  const allowedTargets = ALLOWED_TRANSITIONS[fromKind];
  if (!allowedTargets) {
    assert.fail(`${locator}: ${fromKind} nodes cannot emit edges`);
  }
  if (!allowedTargets.has(toKind)) {
    assert.fail(`${locator}: invalid edge transition ${fromKind} -> ${toKind}`);
  }
  if (toKind === "source" || toKind === "check") {
    assert.fail(`${locator}: ${toKind} nodes cannot receive edges`);
  }
}

function auditProviderOrTerminal(record, locator) {
  const toKind = nodeKind(record.to);
  if (Object.hasOwn(record, "terminal")) {
    assert.equal(
      isTerminalNode(record.to),
      true,
      `${locator}: terminal edge must end at sink.* or inert.*`,
    );
    return;
  }

  if (toKind === "sink" || toKind === "inert") {
    assert.fail(`${locator}: edge to terminal node must carry terminal evidence`);
  }
}

function auditArtifactIdentity(records, violations) {
  const artifactsByWitness = new Map();
  for (const { artifact, record } of records) {
    artifactsByWitness.set(record.file, new Set([
      ...(artifactsByWitness.get(record.file) ?? []),
      artifact,
    ]));
  }

  for (const [file, artifacts] of artifactsByWitness) {
    if (artifacts.size !== 1) {
      violations.push(`${file}: witness records must be emitted by exactly one artifact; saw ${artifacts.size}`);
    }
  }
}

function auditDuplicateRecords(records, violations) {
  const seen = new Map();
  for (const { locator, record } of records) {
    const key = JSON.stringify(record);
    const previous = seen.get(key);
    if (previous) {
      violations.push(`${locator}: duplicate trace record already emitted at ${previous}`);
      continue;
    }
    seen.set(key, locator);
  }
}

function auditPhaseDisambiguation(records, violations) {
  const groups = new Map();
  for (const entry of records) {
    const { record } = entry;
    const key = JSON.stringify({
      file: record.file,
      test: record.test,
      from: record.from,
      to: record.to,
      provider: record.provider,
      terminal: record.terminal,
    });
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  for (const entries of groups.values()) {
    if (entries.length <= 1) {
      continue;
    }
    const phases = new Set();
    for (const { locator, record } of entries) {
      if (!Object.hasOwn(record, "phase")) {
        violations.push(`${locator}: repeated edge evidence must carry a phase`);
        continue;
      }
      if (phases.has(record.phase)) {
        violations.push(`${locator}: repeated edge phase ${JSON.stringify(record.phase)} is not unique`);
        continue;
      }
      phases.add(record.phase);
    }
  }
}

function auditGraphShape(records, violations) {
  const outgoing = nodeMap(records, "from");
  const incoming = nodeMap(records, "to");
  const nodes = new Set([
    ...outgoing.keys(),
    ...incoming.keys(),
  ]);

  for (const node of [...nodes].sort()) {
    const kind = nodeKind(node);
    if (!["sink", "inert"].includes(kind) && incoming.has(node) && !outgoing.has(node)) {
      violations.push(`${node}: non-terminal target has no outgoing evidence`);
    }
    if (!incoming.has(node) && isDisallowedRoot(node)) {
      violations.push(`${node}: non-entry node has no incoming evidence`);
    }
  }

  for (const { locator, record } of records) {
    if (isTerminalNode(record.to) && !Object.hasOwn(record, "terminal")) {
      violations.push(`${locator}: terminal node must be reached by terminal evidence`);
    }
  }
}

function auditGraphReachability(records, violations) {
  const adjacency = adjacencyMap(records, "from", "to");
  const reverseAdjacency = adjacencyMap(records, "to", "from");
  const nodes = graphNodes(records);
  const entryNodes = [...nodes].filter(isEntryNode);
  const terminalNodes = [...nodes].filter(isTerminalNode);

  const reachableFromEntries = traverseGraph(adjacency, entryNodes);
  for (const node of [...nodes].sort()) {
    if (!reachableFromEntries.has(node)) {
      violations.push(`${node}: node is not reachable from any graph entry`);
    }
  }

  const canReachTerminal = traverseGraph(reverseAdjacency, terminalNodes);
  for (const node of [...nodes].sort()) {
    if (!isTerminalNode(node) && !canReachTerminal.has(node)) {
      violations.push(`${node}: node cannot reach a terminal sink/inert node`);
    }
  }
}

function isDisallowedRoot(node) {
  const kind = nodeKind(node);
  if (["source", "check", "view"].includes(kind)) {
    return false;
  }
  return true;
}

function isEntryNode(node) {
  const kind = nodeKind(node);
  return ["source", "check", "view"].includes(kind);
}

function isTerminalNode(node) {
  return ["sink", "inert"].includes(nodeKind(node));
}

function nodeMap(records, field) {
  const map = new Map();
  for (const entry of records) {
    const node = entry.record[field];
    map.set(node, [...(map.get(node) ?? []), entry]);
  }
  return map;
}

function adjacencyMap(records, fromField, toField) {
  const map = new Map();
  for (const { record } of records) {
    const from = record[fromField];
    const to = record[toField];
    map.set(from, new Set([
      ...(map.get(from) ?? []),
      to,
    ]));
  }
  return map;
}

function graphNodes(records) {
  return new Set(records
    .map(({ record }) => [record.from, record.to])
    .flat());
}

function traverseGraph(adjacency, roots) {
  const visited = new Set(roots);
  const pending = [...roots];

  while (pending.length > 0) {
    const node = pending.shift();
    for (const next of adjacency.get(node) ?? []) {
      if (visited.has(next)) {
        continue;
      }
      visited.add(next);
      pending.push(next);
    }
  }

  return visited;
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/");
}

function requiredTraceDir() {
  assert.equal(
    typeof process.env.FLOW_TRACE_DIR,
    "string",
    "FLOW_TRACE_DIR must point at generated flow trace artifacts",
  );
  assert.notEqual(
    process.env.FLOW_TRACE_DIR,
    "",
    "FLOW_TRACE_DIR must point at generated flow trace artifacts",
  );
  const traceDir = path.resolve(process.env.FLOW_TRACE_DIR);
  assert.equal(
    traceDir,
    EXPECTED_TRACE_DIR,
    `FLOW_TRACE_DIR must be ${relativeToRepo(EXPECTED_TRACE_DIR)}`,
  );
  return traceDir;
}

function parseJson(line, locator) {
  try {
    return JSON.parse(line);
  } catch (error) {
    assert.fail(`${locator}: ${error.message}`);
  }
}

function assertPlainObject(value, locator) {
  if (
    value === null
      || typeof value !== "object"
      || Array.isArray(value)
  ) {
    assert.fail(`${locator}: trace record must be a JSON object`);
  }
}

function assertNonEmptyString(value, locator, field) {
  if (typeof value !== "string" || value.length === 0) {
    assert.fail(`${locator}: ${field} must be a non-empty string`);
  }
}

function assertNode(value, locator, field) {
  if (!NODE_PATTERN.test(value)) {
    assert.fail(`${locator}: ${field} has invalid trace node ${JSON.stringify(value)}`);
  }
}

function assertLabel(value, locator, field) {
  assertNonEmptyString(value, locator, field);
  if (!LABEL_PATTERN.test(value)) {
    assert.fail(`${locator}: ${field} has invalid label ${JSON.stringify(value)}`);
  }
}

function nodeKind(node) {
  return node.slice(0, node.indexOf("."));
}

function readStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    assert.fail(`${filePath}: ${error.message}`);
  }
}
