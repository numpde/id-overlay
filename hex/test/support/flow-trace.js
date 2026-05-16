import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const EDGE_FIELD_ORDER = Object.freeze([
  "case",
  "phase",
  "request",
  "resource",
  "surface",
  "obligation",
  "fulfills",
  "provider",
  "terminal",
]);
const KNOWN_EDGE_FIELDS = new Set([
  "from",
  "to",
  ...EDGE_FIELD_ORDER,
]);

export function createFlowTrace({ file, test } = {}) {
  const edges = [];
  let currentSource = null;
  let currentAttributes = {};

  return {
    edges,
    edge(edge) {
      const attributedEdge = {
        ...currentAttributes,
        ...edge,
      };
      assertEdge(attributedEdge);
      edges.push(attributedEdge);
      writeArtifactEdge({ file, test, edge: attributedEdge });
    },
    activeSource() {
      return currentSource;
    },
    activeAttributes() {
      return currentAttributes;
    },
    withSource(source, run) {
      assertNonEmptyString(source, "source");
      const previousSource = currentSource;
      currentSource = source;
      try {
        const result = run();
        if (isPromiseLike(result)) {
          return result.finally(() => {
            currentSource = previousSource;
          });
        }
        currentSource = previousSource;
        return result;
      } catch (error) {
        currentSource = previousSource;
        throw error;
      }
    },
    withAttributes(attributes, run) {
      assertPlainAttributes(attributes);
      const previousAttributes = currentAttributes;
      currentAttributes = {
        ...currentAttributes,
        ...attributes,
      };
      try {
        const result = run();
        if (isPromiseLike(result)) {
          return result.finally(() => {
            currentAttributes = previousAttributes;
          });
        }
        currentAttributes = previousAttributes;
        return result;
      } catch (error) {
        currentAttributes = previousAttributes;
        throw error;
      }
    },
  };
}

export function flowEdge(from, to, attributes = {}) {
  return {
    from,
    to,
    ...attributes,
  };
}

function writeArtifactEdge({ file, test, edge }) {
  const traceDir = process.env.FLOW_TRACE_DIR;
  if (!traceDir) {
    return;
  }
  assertNonEmptyString(file, "file");
  assertNonEmptyString(test, "test");

  const record = canonicalRecord({ file, test, edge });
  fs.appendFileSync(
    path.join(traceDir, `${process.pid}.jsonl`),
    `${JSON.stringify(record)}\n`,
  );
}

function canonicalRecord({ file, test, edge }) {
  const record = {
    file: normalizeFilePath(file),
    test,
    from: edge.from,
    to: edge.to,
  };
  for (const field of EDGE_FIELD_ORDER) {
    if (Object.hasOwn(edge, field)) {
      record[field] = edge[field];
    }
  }
  for (const [field, value] of Object.entries(edge)) {
    if (!KNOWN_EDGE_FIELDS.has(field)) {
      record[field] = value;
    }
  }
  return record;
}

function normalizeFilePath(file) {
  const filePath = file.startsWith("file:")
    ? fileURLToPath(file)
    : file;
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/");
}

function assertEdge(edge) {
  if (
    edge === null
      || typeof edge !== "object"
      || Array.isArray(edge)
  ) {
    throw new TypeError("Flow trace edge must be an object.");
  }
  assertNonEmptyString(edge.from, "from");
  assertNonEmptyString(edge.to, "to");
}

function assertPlainAttributes(attributes) {
  if (
    attributes === null
      || typeof attributes !== "object"
      || Array.isArray(attributes)
  ) {
    throw new TypeError("Flow trace attributes must be an object.");
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Flow trace ${label} must be a non-empty string.`);
  }
}

function isPromiseLike(value) {
  return (
    value !== null
      && typeof value === "object"
      && typeof value.finally === "function"
  );
}
