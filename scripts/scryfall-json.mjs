// CI helper: transforms Scryfall API JSON piped in on stdin. Keeps the deploy
// workflow free of an extra python3 dependency for small JSON extractions.
import { buffer } from "node:stream/consumers";

async function readStdinJson() {
  const raw = await buffer(process.stdin);
  return JSON.parse(raw.toString("utf-8"));
}

async function main() {
  const [subcommand] = process.argv.slice(2);
  const payload = await readStdinJson();

  if (subcommand === "sets") {
    process.stdout.write(JSON.stringify(payload.data, null, 2));
    return;
  }

  if (subcommand === "bulk-data-default-cards") {
    const item = payload.data.find((entry) => entry.type === "default_cards");
    if (!item) throw new Error("No default_cards entry found in bulk-data response.");
    process.stdout.write(`${item.updated_at}\n${item.jsonl_download_uri}\n`);
    return;
  }

  throw new Error(`Unknown subcommand: ${subcommand}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
