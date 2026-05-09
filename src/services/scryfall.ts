// Scryfall API integration and card index caching.
// Responsible for fetching the pre-built card index (cards.json.gz) and
// the sets list (sets.json.gz) from the deployed static assets, and for
// resolving Scryfall IDs to edition codes/collector numbers.
//
// The card index is a compact map of scryfallId → { code, name, collectorNumber, language }
// built at deploy time from Scryfall's default_cards bulk file. This avoids
// hitting the Scryfall API from the browser for every card lookup.
//
// Resolved entries are cached in localStorage (30-day TTL). Failed lookups
// are also cached (3-day negative TTL) to avoid hammering the index on
// repeated runs with the same unresolvable IDs.
// @ts-nocheck
import { LANGUAGES } from "../domain/constants.ts";

const CARD_CACHE_KEY = "box-packer-scryfall-cards-by-id-v1";
const CARD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CARD_NEGATIVE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// Validates that a string looks like a v1-v5 UUID before treating it as a
// Scryfall ID. Prevents wasted index lookups for blank or malformed values.
function isLikelyScryfallId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

// Reads the card cache from localStorage, evicting stale entries in the
// same pass. Returns an empty object if localStorage is unavailable or the
// stored JSON is corrupt.
function loadCardCache() {
  try {
    const raw = localStorage.getItem(CARD_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const now = Date.now();
    const next = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;

      const fetchedAt = Number(entry.fetchedAt || 0);
      const failedAt = Number(entry.failedAt || 0);
      const hasPositiveData = Boolean(entry.code && entry.name);

      if (hasPositiveData) {
        if (!fetchedAt || now - fetchedAt <= CARD_CACHE_TTL_MS) {
          next[id] = entry;
        }
        continue;
      }

      if (failedAt && now - failedAt <= CARD_NEGATIVE_CACHE_TTL_MS) {
        next[id] = entry;
      }
    }

    return next;
  } catch {
    return {};
  }
}

// Persists the in-memory cache back to localStorage. Failures are silently
// swallowed (e.g. private browsing, storage quota exceeded).
function saveCardCache(cache) {
  try {
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures.
  }
}

// Fetches a gzip-compressed JSON file from a URL and returns the parsed object.
// Uses the browser's native DecompressionStream API — no external dependencies.
// Shared by loadCardIndex() and loadScryfallSets().
async function fetchGzJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const ds = new DecompressionStream("gzip");
  const stream = response.body.pipeThrough(ds);
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

// Singleton promise for the card index. The index is large (~several MB
// decompressed) so it is fetched at most once per page load regardless of how
// many IDs need resolving.
let _cardIndexPromise = null;

// Returns the singleton promise for cards.json.gz, initiating the fetch on
// the first call. Subsequent calls return the same in-flight or resolved promise.
function loadCardIndex() {
  if (!_cardIndexPromise) {
    _cardIndexPromise = fetchGzJson("./data/cards.json.gz");
  }
  return _cardIndexPromise;
}

// Resolves an array of Scryfall IDs to their set code, set name, and collector
// number by looking them up in the pre-built card index (cards.json.gz).
// Results are layered: localStorage cache → in-memory index → unresolved.
// Returns { resolvedById: { [id]: cardEntry }, unresolvedIds: string[] }.
export async function resolveCardsByScryfallId(ids) {
  const uniqueIds = [...new Set(ids.map((x) => String(x || "").trim()).filter((x) => x && isLikelyScryfallId(x)))];
  if (!uniqueIds.length) return { resolvedById: {}, unresolvedIds: [] };

  const cache = loadCardCache();
  const resolvedById = {};
  const unresolvedIds = [];
  const queue = [];

  for (const id of uniqueIds) {
    const cached = cache[id];
    if (cached?.code && cached?.name) {
      resolvedById[id] = cached;
    } else if (cached?.failedAt) {
      unresolvedIds.push(id);
    } else {
      queue.push(id);
    }
  }

  if (queue.length) {
    const index = await loadCardIndex();
    for (const id of queue) {
      const entry = index[id];
      if (entry) {
        const value = { ...entry, fetchedAt: Date.now() };
        resolvedById[id] = value;
        cache[id] = value;
      } else {
        unresolvedIds.push(id);
        cache[id] = { failedAt: Date.now(), reason: "not-found" };
      }
    }
    saveCardCache(cache);
  }

  return { resolvedById, unresolvedIds };
}

// Applies Scryfall resolution results back onto raw CSV rows, overwriting
// Edition Code, Edition name, and Card Number when a resolved entry is found.
// Returns a new array; input rows are not mutated.
export function applyScryfallResolutionToRows(rows, resolvedById) {
  return rows.map((row) => {
    const id = String(row["Scryfall ID"] || "").trim();
    const resolved = resolvedById[id];
    if (!resolved) return row;

    const next = { ...row };
    next["Edition Code"] = resolved.code;
    next.Edition = resolved.name;
    if (resolved.collectorNumber) {
      next["Card Number"] = resolved.collectorNumber;
    }
    return next;
  });
}

// Fetches the pre-built Scryfall sets list (sets.json.gz) from the deployed
// static assets. Used during run() to build set mappings before CSV parsing.
export async function loadScryfallSets() {
  return fetchGzJson("./data/sets.json.gz");
}

// Builds a direct URL to a card's page on Scryfall.com.
// When set code and collector number are available the URL is canonical
// (e.g. /card/lea/1/en); otherwise falls back to the Scryfall ID URL.
// Used to make card names in the box modal clickable.
export function scryfallCardUrl(card) {
  const setCode = String(card.setCode || "").toLowerCase();
  const collectorNumber = String(card.collectorNumber || "");
  const lang = LANGUAGES[card.language]?.scryfallCode || "en";
  if (setCode && collectorNumber) {
    return `https://scryfall.com/card/${setCode}/${collectorNumber}/${lang}/`;
  }
  return `https://scryfall.com/card/${card.scryfallId}`;
}
