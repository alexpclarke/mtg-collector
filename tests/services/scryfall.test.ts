import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { resolveCardsByScryfallId, applyScryfallResolutionToRows, loadScryfallSets } from "../../src/services/scryfall.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CARD_CACHE_KEY = "box-packer-scryfall-cards-by-id-v1";

// Valid Scryfall-style UUIDs (v4 format)
const ID_IN_INDEX  = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ID_NOT_FOUND = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const ID_CACHED    = "c3d4e5f6-a7b8-4c9d-ae0f-2a3b4c5d6e7f";

const CARD_INDEX = {
  [ID_IN_INDEX]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" },
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

// Prime the card index fetch before any tests run.
// scryfall.ts caches the card index in a module-level promise (_cardIndexPromise)
// that is set on first call and never cleared. By installing the mock here,
// the first test that triggers an index load will always receive CARD_INDEX,
// and all subsequent tests share that same resolved value.
mockFetch(CARD_INDEX);

// ── applyScryfallResolutionToRows ─────────────────────────────────────────────

test("given row with no matching resolution when applying resolution then row is returned unchanged", () => {
  const row = { "Scryfall ID": ID_IN_INDEX, Edition: "Alpha", "Edition Code": "lea" };
  const [result] = applyScryfallResolutionToRows([row], {});
  assert.equal(result.Edition, "Alpha");
  assert.equal(result["Edition Code"], "lea");
});

test("given row with resolution when applying then edition code and edition name are overwritten", () => {
  const row = { "Scryfall ID": ID_IN_INDEX, Edition: "", "Edition Code": "" };
  const resolved = { [ID_IN_INDEX]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };
  const [result] = applyScryfallResolutionToRows([row], resolved);
  assert.equal(result["Edition Code"], "mh3");
  assert.equal(result.Edition, "Modern Horizons 3");
});

test("given row with resolution and blank card number when applying then card number is filled in", () => {
  const row = { "Scryfall ID": ID_IN_INDEX, "Card Number": "", Edition: "", "Edition Code": "" };
  const resolved = { [ID_IN_INDEX]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };
  const [result] = applyScryfallResolutionToRows([row], resolved);
  assert.equal(result["Card Number"], "42");
});

test("given row with resolution and existing card number when applying then scryfall value overwrites it", () => {
  const row = { "Scryfall ID": ID_IN_INDEX, "Card Number": "99", Edition: "", "Edition Code": "" };
  const resolved = { [ID_IN_INDEX]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };
  const [result] = applyScryfallResolutionToRows([row], resolved);
  assert.equal(result["Card Number"], "42");
});

test("given row with resolution and blank language when applying then language is left blank", () => {
  const row = { "Scryfall ID": ID_IN_INDEX, Language: "", Edition: "", "Edition Code": "" };
  const resolved = { [ID_IN_INDEX]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };
  const [result] = applyScryfallResolutionToRows([row], resolved);
  assert.equal(result.Language, "");
});

test("given row with resolution and existing language when applying then language is left unchanged", () => {
  const row = { "Scryfall ID": ID_IN_INDEX, Language: "Japanese", Edition: "", "Edition Code": "" };
  const resolved = { [ID_IN_INDEX]: { code: "mh3", name: "Modern Horizons 3", collectorNumber: "42", language: "en" } };
  const [result] = applyScryfallResolutionToRows([row], resolved);
  assert.equal(result.Language, "Japanese");
});

// ── resolveCardsByScryfallId ──────────────────────────────────────────────────

test("given empty id list when resolving then both outputs are empty", async () => {
  store.clear();
  const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId([]);
  assert.deepEqual(resolvedById, {});
  assert.deepEqual(unresolvedIds, []);
});

test("given ids that are not valid uuids when resolving then both outputs are empty", async () => {
  store.clear();
  const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId(["not-a-uuid", "123", "", null as any]);
  assert.deepEqual(resolvedById, {});
  assert.deepEqual(unresolvedIds, []);
});

test("given cached id in localStorage when resolving then cache is returned without loading the card index", async () => {
  store.clear();
  const entry = { code: "lea", name: "Limited Edition Alpha", collectorNumber: "1", language: "en", fetchedAt: Date.now() };
  store.set(CARD_CACHE_KEY, JSON.stringify({ [ID_CACHED]: entry }));
  // Poison fetch — if the index were loaded, this would throw
  (globalThis as any).fetch = () => { throw new Error("fetch must not be called for a localStorage cache hit"); };
  const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId([ID_CACHED]);
  assert.deepEqual(unresolvedIds, []);
  assert.equal(resolvedById[ID_CACHED].code, "lea");
  // Restore for subsequent tests
  mockFetch(CARD_INDEX);
});

test("given duplicate ids when resolving then each id appears only once in the result", async () => {
  store.clear();
  const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId([ID_IN_INDEX, ID_IN_INDEX, ID_IN_INDEX]);
  assert.equal(Object.keys(resolvedById).length, 1);
  assert.deepEqual(unresolvedIds, []);
});

test("given id present in card index when resolving then all card fields are returned correctly", async () => {
  store.clear();
  const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId([ID_IN_INDEX]);
  assert.deepEqual(unresolvedIds, []);
  assert.equal(resolvedById[ID_IN_INDEX].code, "mh3");
  assert.equal(resolvedById[ID_IN_INDEX].name, "Modern Horizons 3");
  assert.equal(resolvedById[ID_IN_INDEX].collectorNumber, "42");
  assert.equal(resolvedById[ID_IN_INDEX].language, "en");
});

test("given id absent from card index when resolving then id is placed in unresolvedIds", async () => {
  store.clear();
  const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId([ID_NOT_FOUND]);
  assert.deepEqual(Object.keys(resolvedById), []);
  assert.ok(unresolvedIds.includes(ID_NOT_FOUND));
});

test("given mix of cached and uncached ids when resolving then both sources contribute to the result", async () => {
  store.clear();
  const entry = { code: "lea", name: "Limited Edition Alpha", collectorNumber: "1", language: "en", fetchedAt: Date.now() };
  store.set(CARD_CACHE_KEY, JSON.stringify({ [ID_CACHED]: entry }));
  const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId([ID_CACHED, ID_IN_INDEX]);
  assert.deepEqual(unresolvedIds, []);
  assert.equal(resolvedById[ID_CACHED].code, "lea");
  assert.equal(resolvedById[ID_IN_INDEX].code, "mh3");
});

// ── loadScryfallSets ──────────────────────────────────────────────────────────

test("given valid sets data when loading sets then the sets array is returned", async () => {
  const sets = [{ code: "mh3", name: "Modern Horizons 3" }, { code: "lea", name: "Limited Edition Alpha" }];
  mockFetch(sets);
  const result = await loadScryfallSets();
  assert.deepEqual(result, sets);
});

test("given failed fetch response when loading sets then an error is thrown", async () => {
  (globalThis as any).fetch = async () => ({ ok: false, status: 503, body: new ReadableStream() });
  await assert.rejects(loadScryfallSets, /Failed to fetch/);
});
