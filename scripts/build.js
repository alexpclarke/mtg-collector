import fs from "node:fs";
import path from "node:path";

const DIST = "dist";
const SRC = "src";

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirectoryRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function main() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST);

  copyFile("index.html", path.join(DIST, "index.html"));

  if (fs.existsSync(SRC)) {
    copyDirectoryRecursive(SRC, path.join(DIST, SRC));
  }

  if (fs.existsSync("CNAME")) {
    copyFile("CNAME", path.join(DIST, "CNAME"));
  }

  console.log("Build complete. Output in dist/");
}

main();
