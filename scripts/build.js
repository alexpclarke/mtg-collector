import path from "node:path";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { minify } from "html-minifier-terser";

const DIST = "dist";
const DIST_ASSETS = path.join(DIST, "assets");

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function findLatestFile(dir, pattern) {
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return null;
  }
  const matches = files.filter((f) => pattern.test(f)).sort().reverse();
  return matches.length ? path.join(dir, matches[0]) : null;
}

async function buildScryfallData() {
  const dataDir = "data/scryfall";
  const outDir = path.join(DIST, "data");
  await fs.mkdir(outDir, { recursive: true });

  const setsFile = await findLatestFile(dataDir, /^sets-\d{4}-\d{2}-\d{2}\.json\.gz$/);
  if (setsFile) {
    await copyFile(setsFile, path.join(outDir, "sets.json.gz"));
    console.log(`Copied sets data from ${path.basename(setsFile)}.`);
  } else {
    console.warn("Warning: no sets bulk data found in data/scryfall/. Run the update-scryfall-bulk-data workflow first.");
  }

  const cardsFile = await findLatestFile(dataDir, /^default-cards-\d{4}-\d{2}-\d{2}\.json\.gz$/);
  if (cardsFile) {
    console.log(`Building card index from ${path.basename(cardsFile)}...`);
    const tmpFile = path.join(outDir, "_cards-index.tmp.json");
    const pyScript = [
      "import json, sys, gzip",
      "with gzip.open(sys.argv[1]) as f: cards = json.load(f)",
      "index = {}",
      "for c in cards:",
      "    if c.get('id'):",
      "        index[c['id']] = {'code': (c.get('set') or '').lower(), 'name': c.get('set_name') or '', 'collectorNumber': c.get('collector_number') or '', 'language': c.get('lang') or ''}",
      "with open(sys.argv[2], 'w') as out: json.dump(index, out, separators=(',',':'))",
    ].join("\n");
    execFileSync("python3", ["-c", pyScript, cardsFile, tmpFile]);
    const jsonBuf = await fs.readFile(tmpFile);
    await fs.unlink(tmpFile);
    await fs.writeFile(path.join(outDir, "cards.json.gz"), gzipSync(jsonBuf));
    console.log(`Card index written (${(jsonBuf.length / 1024 / 1024).toFixed(1)} MB uncompressed).`);
  } else {
    console.warn("Warning: no default-cards bulk data found in data/scryfall/. Run the update-scryfall-bulk-data workflow first.");
  }
}

async function buildIndexHtml() {
  const source = await fs.readFile("index.html", "utf8");
  const rewritten = source
    .replace('./src/ui/styles.css', './assets/styles.min.css')
    .replace('./src/main.ts', './assets/app.min.js')
    .replace('./src/gitrohub-light.svg', './assets/gitrohub-light.svg')
    .replace('./src/gitrohub-dark.svg', './assets/gitrohub-dark.svg');

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
  await copyFile("src/gitrohub-light.svg", path.join(DIST_ASSETS, "gitrohub-light.svg"));
  await copyFile("src/gitrohub-dark.svg", path.join(DIST_ASSETS, "gitrohub-dark.svg"));
  await buildScryfallData();

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
