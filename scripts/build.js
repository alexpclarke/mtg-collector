import path from "node:path";
import { promises as fs } from "node:fs";
import { minify } from "html-minifier-terser";

const DIST = "dist";
const DIST_ASSETS = path.join(DIST, "assets");

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function buildIndexHtml() {
  const source = await fs.readFile("index.html", "utf8");
  const rewritten = source
    .replace('./src/ui/styles.css', './assets/styles.min.css')
    .replace('./src/main.js', './assets/app.min.js');

  const minified = await minify(rewritten, {
    collapseWhitespace: true,
    removeComments: true,
    keepClosingSlash: true,
    minifyCSS: false,
    minifyJS: false,
  });

  await fs.writeFile(path.join(DIST, "index.html"), minified, "utf8");
}

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST_ASSETS, { recursive: true });

  await buildIndexHtml();

  try {
    await fs.access("CNAME");
    await copyFile("CNAME", path.join(DIST, "CNAME"));
  } catch {
  // no-op when CNAME is not present
  }

  console.log("Build scaffold complete. Output in dist/");
}

main().catch((error) => {
  console.error("Build scaffold failed:", error);
  process.exitCode = 1;
});
