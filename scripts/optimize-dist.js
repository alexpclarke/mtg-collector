import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

const DIST_DIR = "dist";
const DIST_ASSETS_DIR = path.join(DIST_DIR, "assets");

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

function withHashedName(fileName, hash) {
  if (fileName.endsWith(".min.js")) {
    return fileName.replace(".min.js", `.${hash}.min.js`);
  }
  if (fileName.endsWith(".min.css")) {
    return fileName.replace(".min.css", `.${hash}.min.css`);
  }
  const ext = path.extname(fileName);
  const base = fileName.slice(0, -ext.length);
  return `${base}.${hash}${ext}`;
}

async function renameWithHash(fileName) {
  const sourcePath = path.join(DIST_ASSETS_DIR, fileName);
  const content = await fs.readFile(sourcePath);
  const hash = hashContent(content);
  const hashedName = withHashedName(fileName, hash);
  const targetPath = path.join(DIST_ASSETS_DIR, hashedName);
  await fs.rename(sourcePath, targetPath);
  return { fileName, hashedName };
}

async function rewriteIndexHtml(replacements) {
  const indexPath = path.join(DIST_DIR, "index.html");
  let html = await fs.readFile(indexPath, "utf8");

  for (const { fileName, hashedName } of replacements) {
    html = html.replace(`./assets/${fileName}`, `./assets/${hashedName}`);
  }

  await fs.writeFile(indexPath, html, "utf8");
}

async function main() {
  const filesToHash = ["app.min.js", "styles.min.css"];
  const replacements = [];

  for (const fileName of filesToHash) {
    replacements.push(await renameWithHash(fileName));
  }

  await rewriteIndexHtml(replacements);

  console.log("Optimized dist with hashed assets.");
}

main().catch((error) => {
  console.error("Failed to optimize dist:", error);
  process.exitCode = 1;
});
