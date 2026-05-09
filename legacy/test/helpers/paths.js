import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const DIST_DIR = path.join(REPO_ROOT, "dist");

export function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

export function repoFileUrl(...parts) {
  return pathToFileURL(repoPath(...parts)).href;
}

