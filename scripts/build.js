import path from "node:path";
import { createReadStream, promises as fs } from "node:fs";
import readline from "node:readline";
import { createGunzip, gzipSync } from "node:zlib";
import { buffer as streamToBuffer } from "node:stream/consumers";

const PUBLIC_DATA = path.join("public", "data");

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

// Compact index entry: only the fields the app needs to resolve a Scryfall ID.
function toIndexEntry(card) {
  return {
    code: (card.set || "").toLowerCase(),
    name: card.set_name || "",
    collectorNumber: card.collector_number || "",
    language: card.lang || "",
  };
}

// Streams a gzip-compressed JSONL file line-by-line so the full decompressed
// default-cards payload (several hundred MB) is never held in memory at once.
async function buildCardIndexFromJsonl(cardsFile) {
  const index = {};
  const gunzip = createReadStream(cardsFile).pipe(createGunzip());
  const lines = readline.createInterface({ input: gunzip, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const card = JSON.parse(line);
    if (card.id) index[card.id] = toIndexEntry(card);
  }
  return index;
}

// Legacy fallback for a gzip-compressed JSON array (whole file must be buffered).
async function buildCardIndexFromJsonArray(cardsFile) {
  const decompressed = await streamToBuffer(createReadStream(cardsFile).pipe(createGunzip()));
  const cards = JSON.parse(decompressed.toString("utf-8"));
  const index = {};
  for (const card of cards) {
    if (card.id) index[card.id] = toIndexEntry(card);
  }
  return index;
}

async function buildScryfallData() {
  const dataDir = "data/scryfall";
  const outDir = PUBLIC_DATA;
  await fs.mkdir(outDir, { recursive: true });

  const setsFile = await findLatestFile(dataDir, /^sets-\d{4}-\d{2}-\d{2}\.json\.gz$/);
  if (setsFile) {
    await fs.copyFile(setsFile, path.join(outDir, "sets.json.gz"));
    console.log(`Copied sets data from ${path.basename(setsFile)}.`);
  } else {
    console.warn("Warning: no sets bulk data found in data/scryfall/. Run the update-scryfall-bulk-data workflow first.");
  }

  const cardsFile = (await findLatestFile(dataDir, /^default-cards-\d{4}-\d{2}-\d{2}\.jsonl\.gz$/))
    ?? (await findLatestFile(dataDir, /^default-cards-\d{4}-\d{2}-\d{2}\.json\.gz$/));
  if (cardsFile) {
    console.log(`Building card index from ${path.basename(cardsFile)}...`);
    const index = cardsFile.endsWith(".jsonl.gz")
      ? await buildCardIndexFromJsonl(cardsFile)
      : await buildCardIndexFromJsonArray(cardsFile);
    const jsonBuf = Buffer.from(JSON.stringify(index));
    await fs.writeFile(path.join(outDir, "cards.json.gz"), gzipSync(jsonBuf));
    console.log(`Card index written (${(jsonBuf.length / 1024 / 1024).toFixed(1)} MB uncompressed).`);
  } else {
    console.warn("Warning: no default-cards bulk data found in data/scryfall/. Run the update-scryfall-bulk-data workflow first.");
  }
}

async function main() {
  await buildScryfallData();

  try {
    await fs.access("CNAME");
    await fs.mkdir("public", { recursive: true });
    await fs.copyFile("CNAME", path.join("public", "CNAME"));
  } catch {
  // no-op when CNAME is not present
  }

  console.log("Scryfall data prepared in public/data/");
}

main().catch((error) => {
  console.error("Build scaffold failed:", error);
  process.exitCode = 1;
});
