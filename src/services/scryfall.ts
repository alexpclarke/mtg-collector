// Scryfall API integration and card index caching.
// Responsible for fetching the pre-built card index (cards.json.gz) and
// the sets list (sets.json.gz) from the deployed static assets, and for
// resolving Scryfall identifiers to edition codes/collector numbers.
//
// The card index is a compact map of scryfallId → { code, name, collectorNumber, language }
// built at deploy time from Scryfall's default_cards bulk file. This avoids
// hitting the Scryfall API from the browser for every card lookup.
//
// Resolved entries are cached in localStorage (30-day TTL). Failed lookups
// are also cached (3-day negative TTL) to avoid hammering the index on
// repeated runs with the same unresolvable identifiers.
// @ts-nocheck
import { LANGUAGES } from "../domain/constants.ts";

const CARD_CACHE_STORAGE_KEY = "box-packer-scryfall-cards-by-id-v1";
const POSITIVE_CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

// Validates that a string looks like a v1-v5 UUID before treating it as a
// Scryfall identifier. Prevents wasted index lookups for blank or malformed values.
function isValidScryfallIdentifier(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

// Returns true when a cache entry contains a successfully resolved card record.
function isResolvedCacheEntry(entry) {
  return Boolean(entry && entry.code && entry.name);
}

// Returns true when a cache entry records a previous lookup failure (negative cache hit).
function isFailedCacheEntry(entry) {
  return Boolean(entry && entry.failedAt);
}

// Returns true when a positive (resolved) cache entry is still within its TTL.
function isPositiveCacheEntryFresh(entry, now) {
  const fetchedAt = Number(entry.fetchedAt || 0);
  return !fetchedAt || now - fetchedAt <= POSITIVE_CACHE_DURATION_MS;
}

// Returns true when a negative (failed) cache entry is still within its TTL.
function isNegativeCacheEntryFresh(entry, now) {
  const failedAt = Number(entry.failedAt || 0);
  return Boolean(failedAt) && now - failedAt <= NEGATIVE_CACHE_DURATION_MS;
}

// Reads the raw card cache from localStorage and returns the parsed object.
// Returns an empty object when localStorage is unavailable or the stored JSON is corrupt.
// Does not filter or mutate the stored data.
function readRawCacheFromStorage() {
  try {
    const stored = localStorage.getItem(CARD_CACHE_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Returns a copy of a raw cache with stale entries removed.
// Positive entries are retained when within the 30-day TTL;
// negative entries are retained when within the 3-day TTL.
function withStaleEntriesRemoved(rawCache) {
  const now = Date.now();
  const result = {};
  for (const [identifier, entry] of Object.entries(rawCache)) {
    if (!entry || typeof entry !== "object") continue;
    if (isResolvedCacheEntry(entry) && isPositiveCacheEntryFresh(entry, now)) {
      result[identifier] = entry;
    } else if (isNegativeCacheEntryFresh(entry, now)) {
      result[identifier] = entry;
    }
  }
  return result;
}

// Returns the current card cache from localStorage with stale entries removed.
// Pure query — does not write to localStorage.
function readCardCache() {
  return withStaleEntriesRemoved(readRawCacheFromStorage());
}

// Persists the in-memory cache back to localStorage.
// Failures are silently swallowed (e.g. private browsing, storage quota exceeded).
function persistCardCache(cache) {
  try {
    localStorage.setItem(CARD_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage write failures are non-fatal.
  }
}

// Fetches a gzip-compressed JSON file from a URL and returns the parsed object.
// Uses the browser's native DecompressionStream API — no external dependencies.
// Shared by loadCardIndex() and loadScryfallSets().
async function fetchCompressedJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const decompressionStream = new DecompressionStream("gzip");
  const stream = response.body.pipeThrough(decompressionStream);
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

// Singleton promise for the card index. The index is large (~several MB decompressed)
// so it is fetched at most once per page load regardless of how many identifiers need resolving.
let cardIndexPromise = null;

// Returns the singleton promise for cards.json.gz, initiating the fetch on the first call.
// Subsequent calls return the same in-flight or resolved promise.
function loadCardIndex() {
  if (!cardIndexPromise) {
    cardIndexPromise = fetchCompressedJson("./data/cards.json.gz");
  }
  return cardIndexPromise;
}

// Splits a list of identifiers into three groups based on what the cache already knows:
// resolved (positive hit), failed (negative hit), or uncached (needs index lookup).
function partitionIdentifiersByCache(identifiers, cache) {
  const resolved = {};
  const failed = [];
  const uncached = [];
  for (const identifier of identifiers) {
    const entry = cache[identifier];
    if (isResolvedCacheEntry(entry)) {
      resolved[identifier] = entry;
    } else if (isFailedCacheEntry(entry)) {
      failed.push(identifier);
    } else {
      uncached.push(identifier);
    }
  }
  return { resolved, failed, uncached };
}

// Looks up a list of identifiers in the pre-built card index.
// Returns resolved entries and a list of identifiers not present in the index.
// Pure function — does not read or write localStorage.
function lookUpIdentifiersInIndex(identifiers, cardIndex) {
  const resolved = {};
  const notFound = [];
  for (const identifier of identifiers) {
    const entry = cardIndex[identifier];
    if (entry) {
      resolved[identifier] = entry;
    } else {
      notFound.push(identifier);
    }
  }
  return { resolved, notFound };
}

// Builds a cache entry for a successfully resolved card, stamped with the current time.
function buildResolvedCacheEntry(cardData) {
  return { ...cardData, fetchedAt: Date.now() };
}

// Builds a cache entry recording that a lookup failed (negative cache hit).
function buildFailedCacheEntry() {
  return { failedAt: Date.now(), reason: "not-found" };
}

// Resolves an array of Scryfall identifiers to their set code, set name, and collector
// number by looking them up in the pre-built card index (cards.json.gz).
// Results layer in order: localStorage cache → in-memory card index → unresolved.
// The only side effect is persisting newly resolved/failed entries into the cache.
// Returns { resolvedByIdentifier: { [id]: cardEntry }, unresolvedIdentifiers: string[] }.
export async function resolveCardsByIdentifier(identifiers) {
  const uniqueIdentifiers = [
    ...new Set(identifiers.map((x) => String(x || "").trim()).filter((x) => x && isValidScryfallIdentifier(x))),
  ];
  if (!uniqueIdentifiers.length) return { resolvedByIdentifier: {}, unresolvedIdentifiers: [] };

  const cache = readCardCache();
  const { resolved: cachedResolutions, failed: negativeCacheHits, uncached } = partitionIdentifiersByCache(uniqueIdentifiers, cache);

  if (!uncached.length) {
    return { resolvedByIdentifier: cachedResolutions, unresolvedIdentifiers: negativeCacheHits };
  }

  const cardIndex = await loadCardIndex();
  const { resolved: indexResolutions, notFound } = lookUpIdentifiersInIndex(uncached, cardIndex);

  const updatedCache = { ...cache };
  const newlyResolved = {};
  for (const [identifier, cardData] of Object.entries(indexResolutions)) {
    const entry = buildResolvedCacheEntry(cardData);
    newlyResolved[identifier] = entry;
    updatedCache[identifier] = entry;
  }
  for (const identifier of notFound) {
    updatedCache[identifier] = buildFailedCacheEntry();
  }
  persistCardCache(updatedCache);

  return {
    resolvedByIdentifier: { ...cachedResolutions, ...newlyResolved },
    unresolvedIdentifiers: [...negativeCacheHits, ...notFound],
  };
}

// Applies a resolution result to a single inventory row, overwriting Edition Code,
// Edition name, and Card Number when a match is found.
// Returns a new row object; does not mutate the original.
function applyResolutionToRow(row, resolvedByIdentifier) {
  const identifier = String(row["Scryfall ID"] || "").trim();
  const resolution = resolvedByIdentifier[identifier];
  if (!resolution) return row;

  const updated = { ...row };
  updated["Edition Code"] = resolution.code;
  updated.Edition = resolution.name;
  if (resolution.collectorNumber) {
    updated["Card Number"] = resolution.collectorNumber;
  }
  return updated;
}

// Applies Scryfall resolution results back onto raw CSV rows.
// Returns a new array; input rows are not mutated.
export function applyResolutionToInventoryRows(rows, resolvedByIdentifier) {
  return rows.map((row) => applyResolutionToRow(row, resolvedByIdentifier));
}

// Fetches the pre-built Scryfall sets list (sets.json.gz) from the deployed
// static assets. Used during run() to build set mappings before CSV parsing.
// Also returns the Last-Modified response header as dataTimestamp so the UI
// can display when the Scryfall data was last refreshed.
export async function loadScryfallSets() {
  const url = "./data/sets.json.gz";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const decompressionStream = new DecompressionStream("gzip");
  const stream = response.body.pipeThrough(decompressionStream);
  const text = await new Response(stream).text();
  const sets = JSON.parse(text);
  const dataTimestamp = response.headers?.get("Last-Modified") ?? null;
  return { sets, dataTimestamp };
}

// Builds a direct URL to a card's page on Scryfall.com.
// When set code and collector number are available the URL is canonical
// (e.g. /card/lea/1/en); otherwise falls back to the Scryfall identifier URL.
// Used to make card names in the box modal clickable.
export function buildScryfallCardUrl(card) {
  const setCode = String(card.setCode || "").toLowerCase();
  const collectorNumber = String(card.collectorNumber || "");
  const languageCode = LANGUAGES[card.language]?.scryfallCode || "en";
  if (setCode && collectorNumber) {
    return `https://scryfall.com/card/${setCode}/${collectorNumber}/${languageCode}/`;
  }
  return `https://scryfall.com/card/${card.scryfallId}`;
}
