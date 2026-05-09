import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { resolveCardsByIdentifier, applyResolutionToInventoryRows, loadScryfallSets, buildScryfallCardUrl } from "../../src/services/scryfall.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Valid Scryfall-style UUIDs used as test identifiers.
const ID_ALPHA = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ID_BETA = "c3d4e5f6-a7b8-4c9d-ae0f-2a3b4c5d6e7f";
const ID_MISSING = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

const CARD_INDEX = {
  [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" },
  [ID_BETA]: { code: "lea", name: "Limited Edition Alpha", collectorNumber: "1", language: "en" },
};

// ── localStorage mock ─────────────────────────────────────────────────────────
//
// Node has no localStorage; provide a simple in-memory stand-in before any
// code in scryfall.ts can run.

const store = new Map();

(globalThis as any).localStorage = {
  getItem:    (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem:    (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear:      () => store.clear(),
};

// ── fetch mock helper ─────────────────────────────────────────────────────────

function mockFetch(data: unknown) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(data)));
  (globalThis as any).fetch = async () => ({
    ok:     true,
    status: 200,
    body:   new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(new Uint8Array(compressed));
        ctrl.close();
      },
    }),
  });
}

// Prime the card index fetch before any tests run. The card index is fetched
// lazily and memoized for the duration of the process, so this mock must be
// installed before the first test triggers a card lookup.
mockFetch(CARD_INDEX);

// ── applyResolutionToInventoryRows ────────────────────────────────────────────

test("given a row with no matching resolution when applying then the row is returned unchanged", () => {
  // Setup
  const row = { "Scryfall ID": ID_ALPHA, Edition: "Alpha", "Edition Code": "lea" };

  // Exercise
  const [result] = applyResolutionToInventoryRows([row], {});

  // Verify
  assert.equal(result.Edition, "Alpha");
  assert.equal(result["Edition Code"], "lea");
});

test("given a row with resolution when applying then edition code and edition name are overwritten", () => {
  // Setup
  const row = { "Scryfall ID": ID_ALPHA, Edition: "", "Edition Code": "" };
  const resolution = { [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };

  // Exercise
  const [result] = applyResolutionToInventoryRows([row], resolution);

  // Verify
  assert.equal(result["Edition Code"], "mh3");
  assert.equal(result.Edition, "Modern Horizons 3");
});

test("given a row with resolution and a blank card number when applying then the card number is filled in", () => {
  // Setup
  const row = { "Scryfall ID": ID_ALPHA, "Card Number": "", Edition: "", "Edition Code": "" };
  const resolution = { [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };

  // Exercise
  const [result] = applyResolutionToInventoryRows([row], resolution);

  // Verify
  assert.equal(result["Card Number"], "42");
});

test("given a row with resolution and an existing card number when applying then the scryfall value overwrites it", () => {
  // Setup
  const row = { "Scryfall ID": ID_ALPHA, "Card Number": "99", Edition: "", "Edition Code": "" };
  const resolution = { [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };

  // Exercise
  const [result] = applyResolutionToInventoryRows([row], resolution);

  // Verify
  assert.equal(result["Card Number"], "42");
});

test("given a row with resolution and a blank language when applying then language is left blank", () => {
  // Setup
  const row = { "Scryfall ID": ID_ALPHA, Language: "", Edition: "", "Edition Code": "" };
  const resolution = { [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };

  // Exercise
  const [result] = applyResolutionToInventoryRows([row], resolution);

  // Verify
  assert.equal(result.Language, "");
});

test("given a row with resolution and an existing language when applying then language is left unchanged", () => {
  // Setup
  const row = { "Scryfall ID": ID_ALPHA, Language: "Japanese", Edition: "", "Edition Code": "" };
  const resolution = { [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };

  // Exercise
  const [result] = applyResolutionToInventoryRows([row], resolution);

  // Verify
  assert.equal(result.Language, "Japanese");
});

test("given multiple rows with mixed resolutions when applying then each row is updated independently", () => {
  // Setup
  const rows = [
    { "Scryfall ID": ID_ALPHA, Edition: "", "Edition Code": "" },
    { "Scryfall ID": ID_MISSING, Edition: "Alpha", "Edition Code": "lea" },
  ];
  const resolution = { [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };

  // Exercise
  const results = applyResolutionToInventoryRows(rows, resolution);

  // Verify
  assert.equal(results[0]["Edition Code"], "mh3");
  assert.equal(results[1]["Edition Code"], "lea");
});

test("given input rows when applying resolution then original rows are not mutated", () => {
  // Setup
  const row = { "Scryfall ID": ID_ALPHA, Edition: "original", "Edition Code": "orig" };
  const resolution = { [ID_ALPHA]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };

  // Exercise
  applyResolutionToInventoryRows([row], resolution);

  // Verify
  assert.equal(row.Edition, "original");
  assert.equal(row["Edition Code"], "orig");
});

// ── resolveCardsByIdentifier ──────────────────────────────────────────────────

test("given an empty identifier list when resolving then both outputs are empty", async () => {
  // Setup
  store.clear();

  // Exercise
  const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier([]);

  // Verify
  assert.deepEqual(resolvedByIdentifier, {});
  assert.deepEqual(unresolvedIdentifiers, []);
});

test("given identifiers that are not valid UUIDs when resolving then both outputs are empty", async () => {
  // Setup
  store.clear();

  // Exercise
  const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier(["not-a-uuid", "123", "", null as any]);

  // Verify
  assert.deepEqual(resolvedByIdentifier, {});
  assert.deepEqual(unresolvedIdentifiers, []);
});

test("given a valid identifier present in the card index when resolving then all card fields are returned", async () => {
  // Setup
  store.clear();

  // Exercise
  const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier([ID_ALPHA]);

  // Verify
  assert.deepEqual(unresolvedIdentifiers, []);
  assert.equal(resolvedByIdentifier[ID_ALPHA].code, "mh3");
  assert.equal(resolvedByIdentifier[ID_ALPHA].name, "Modern Horizons 3");
  assert.equal(resolvedByIdentifier[ID_ALPHA].collectorNumber, "42");
  assert.equal(resolvedByIdentifier[ID_ALPHA].language, "en");
});

test("given an identifier absent from the card index when resolving then it appears in unresolvedIdentifiers", async () => {
  // Setup
  store.clear();

  // Exercise
  const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier([ID_MISSING]);

  // Verify
  assert.deepEqual(Object.keys(resolvedByIdentifier), []);
  assert.ok(unresolvedIdentifiers.includes(ID_MISSING));
});

test("given duplicate identifiers in the input when resolving then each identifier appears only once in the result", async () => {
  // Setup
  store.clear();

  // Exercise
  const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier([ID_ALPHA, ID_ALPHA, ID_ALPHA]);

  // Verify
  assert.equal(Object.keys(resolvedByIdentifier).length, 1);
  assert.deepEqual(unresolvedIdentifiers, []);
});

test("given multiple identifiers in a single call when resolving then all are returned", async () => {
  // Setup
  store.clear();

  // Exercise
  const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier([ID_ALPHA, ID_BETA]);

  // Verify
  assert.deepEqual(unresolvedIdentifiers, []);
  assert.equal(resolvedByIdentifier[ID_ALPHA].code, "mh3");
  assert.equal(resolvedByIdentifier[ID_BETA].code, "lea");
});

test("given a previously resolved identifier when resolving again then the result is returned without a network call", async () => {
  // Setup: resolve once to populate the cache, then block further network access
  store.clear();
  mockFetch(CARD_INDEX);
  await resolveCardsByIdentifier([ID_ALPHA]);
  (globalThis as any).fetch = () => { throw new Error("Unexpected network call — result should be served from cache"); };

  // Exercise
  const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier([ID_ALPHA]);

  // Verify
  assert.deepEqual(unresolvedIdentifiers, []);
  assert.equal(resolvedByIdentifier[ID_ALPHA].code, "mh3");

  // Teardown
  mockFetch(CARD_INDEX);
});

// ── loadScryfallSets ──────────────────────────────────────────────────────────

test("given valid sets data when loading sets then the sets array is returned", async () => {
  // Setup
  const sets = [{ code: "mh3", name: "Modern Horizons 3" }, { code: "lea", name: "Limited Edition Alpha" }];
  mockFetch(sets);

  // Exercise
  const { sets: result } = await loadScryfallSets();

  // Verify
  assert.deepEqual(result, sets);
});

test("given a failed fetch response when loading sets then an error is thrown", async () => {
  // Setup
  (globalThis as any).fetch = async () => ({ ok: false, status: 503, body: new ReadableStream() });

  // Exercise + Verify
  await assert.rejects(() => loadScryfallSets().then(r => r.sets), /Failed to fetch/);
});

// ── buildScryfallCardUrl ──────────────────────────────────────────────────────

test("given a card with set code and collector number when building url then a canonical scryfall url is returned", () => {
  // Setup
  const card = { scryfallId: ID_ALPHA, setCode: "mh3", collectorNumber: "42", language: "English" };

  // Exercise
  const url = buildScryfallCardUrl(card);

  // Verify
  assert.match(url, /^https:\/\/scryfall\.com\/card\/mh3\/42\//);
});

test("given a card without a set code when building url then the scryfall id url is returned", () => {
  // Setup
  const card = { scryfallId: ID_ALPHA, setCode: "", collectorNumber: "42", language: "English" };

  // Exercise
  const url = buildScryfallCardUrl(card);

  // Verify
  assert.equal(url, `https://scryfall.com/card/${ID_ALPHA}`);
});

test("given a card without a collector number when building url then the scryfall id url is returned", () => {
  // Setup
  const card = { scryfallId: ID_ALPHA, setCode: "mh3", collectorNumber: "", language: "English" };

  // Exercise
  const url = buildScryfallCardUrl(card);

  // Verify
  assert.equal(url, `https://scryfall.com/card/${ID_ALPHA}`);
});

test("given a card with a non-English language when building url then the language code is included in the url", () => {
  // Setup
  const card = { scryfallId: ID_ALPHA, setCode: "mh3", collectorNumber: "42", language: "Japanese" };

  // Exercise
  const url = buildScryfallCardUrl(card);

  // Verify — Japanese maps to Scryfall code "ja"
  assert.match(url, /\/ja\//);
});

test("given a card with an unrecognised language when building url then the url defaults to English", () => {
  // Setup
  const card = { scryfallId: ID_ALPHA, setCode: "mh3", collectorNumber: "42", language: "Klingon" };

  // Exercise
  const url = buildScryfallCardUrl(card);

  // Verify
  assert.match(url, /\/en\//);
});
