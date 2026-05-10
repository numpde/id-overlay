import fs from "node:fs/promises";
import path from "node:path";

export const WEB_ACCESSIBLE_CONTENT_ENTRYPOINT = "hex/bootstrap/extension-content.js";
export const WEB_ACCESSIBLE_STATIC_RESOURCES = Object.freeze([]);

export async function createChromeManifest({ root, sourceManifest }) {
  return {
    ...sourceManifest,
    web_accessible_resources: [
      {
        resources: await collectWebAccessibleResources({ root }),
        matches: sourceManifest.host_permissions,
      },
    ],
  };
}

export async function collectWebAccessibleResources({ root }) {
  const resources = [
    ...WEB_ACCESSIBLE_STATIC_RESOURCES,
    ...await collectModuleGraph({
      root,
      entryPath: WEB_ACCESSIBLE_CONTENT_ENTRYPOINT,
    }),
  ];
  return [...new Set(resources)];
}

export async function collectModuleGraph({ root, entryPath, seen = new Set() }) {
  if (seen.has(entryPath)) {
    return seen;
  }
  seen.add(entryPath);

  const source = await fs.readFile(path.join(root, entryPath), "utf8");
  for (const specifier of collectRelativeModuleSpecifiers(source)) {
    const resolved = normalizeSourcePath(path.join(path.dirname(entryPath), specifier));
    if (!isCollectableProductionResource(resolved)) {
      continue;
    }
    await collectModuleGraph({ root, entryPath: resolved, seen });
  }

  return seen;
}

function isCollectableProductionResource(resourcePath) {
  return resourcePath.startsWith("hex/")
    && !resourcePath.startsWith("hex/test/")
    && !resourcePath.includes("/legacy/");
}

export function collectRelativeModuleSpecifiers(source) {
  const specifiers = [];
  let index = 0;

  while (index < source.length) {
    const nextIndex = skipNonCode(source, index);
    if (nextIndex !== index) {
      index = nextIndex;
      continue;
    }

    if (startsWord(source, index, "import")) {
      const statement = readStatement(source, index);
      const specifier = readImportSpecifier(statement.text);
      if (isRelativeSpecifier(specifier)) {
        specifiers.push(specifier);
      }
      index = statement.end;
      continue;
    }

    if (startsWord(source, index, "export")) {
      const statement = readStatement(source, index);
      const specifier = readFromSpecifier(statement.text);
      if (isRelativeSpecifier(specifier)) {
        specifiers.push(specifier);
      }
      index = statement.end;
      continue;
    }

    index += 1;
  }

  return specifiers;
}

function readImportSpecifier(statement) {
  const dynamicImportMatch = /^import\s*\(\s*["']([^"']+)["']\s*\)/s.exec(statement);
  if (dynamicImportMatch) {
    return dynamicImportMatch[1];
  }

  const sideEffectImportMatch = /^import\s*["']([^"']+)["']/s.exec(statement);
  if (sideEffectImportMatch) {
    return sideEffectImportMatch[1];
  }

  return readFromSpecifier(statement);
}

function readFromSpecifier(statement) {
  return /\bfrom\s*["']([^"']+)["']/s.exec(statement)?.[1] ?? null;
}

function isRelativeSpecifier(specifier) {
  return typeof specifier === "string" && specifier.startsWith(".");
}

function readStatement(source, start) {
  let index = start;
  while (index < source.length) {
    const nextIndex = skipNonCode(source, index);
    if (nextIndex !== index) {
      index = nextIndex;
      continue;
    }
    if (source[index] === ";") {
      return {
        text: source.slice(start, index + 1),
        end: index + 1,
      };
    }
    index += 1;
  }

  return {
    text: source.slice(start),
    end: source.length,
  };
}

function skipNonCode(source, index) {
  const char = source[index];
  const nextChar = source[index + 1];

  if (char === "/" && nextChar === "/") {
    const newlineIndex = source.indexOf("\n", index + 2);
    return newlineIndex === -1 ? source.length : newlineIndex + 1;
  }

  if (char === "/" && nextChar === "*") {
    const commentEndIndex = source.indexOf("*/", index + 2);
    return commentEndIndex === -1 ? source.length : commentEndIndex + 2;
  }

  if (char === "\"" || char === "'" || char === "`") {
    return skipQuotedLiteral(source, index, char);
  }

  return index;
}

function skipQuotedLiteral(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) {
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function startsWord(source, index, word) {
  return source.startsWith(word, index) &&
    !isIdentifierChar(source[index - 1]) &&
    !isIdentifierChar(source[index + word.length]);
}

function isIdentifierChar(char) {
  return typeof char === "string" && /[A-Za-z0-9_$]/.test(char);
}

function normalizeSourcePath(filePath) {
  return path
    .normalize(filePath)
    .replace(/\\/g, "/");
}
