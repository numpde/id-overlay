import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const manifestSource = path.join(root, "manifest.chrome.json");
  const manifestTarget = path.join(distDir, "manifest.json");
  const manifestBuffer = await readFile(manifestSource);
  await writeFile(manifestTarget, manifestBuffer);
  const manifest = JSON.parse(String(manifestBuffer));

  for (const entry of ["src", "assets"]) {
    const source = path.join(root, entry);
    try {
      await cp(source, path.join(distDir, entry), { recursive: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  const buildInfoTarget = path.join(distDir, "src", "core", "build-info.js");
  const builtAt = new Date().toISOString();
  await writeFile(
    buildInfoTarget,
    [
      "export const BUILD_INFO = Object.freeze({",
      `  version: ${JSON.stringify(manifest.version)},`,
      `  builtAt: ${JSON.stringify(builtAt)},`,
      "});",
      "",
    ].join("\n"),
  );

  process.stdout.write(`Built Chromium extension scaffold in ${distDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
