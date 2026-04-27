// @ts-nocheck
const CARD_CACHE_KEY = "box-packer-scryfall-cards-by-id-v1";
const CARD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CARD_NEGATIVE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function isLikelyScryfallId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

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

function saveCardCache(cache) {
  try {
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures.
  }
}

async function fetchGzJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const ds = new DecompressionStream("gzip");
  const stream = response.body.pipeThrough(ds);
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

let _cardIndexPromise = null;

function loadCardIndex() {
  if (!_cardIndexPromise) {
    _cardIndexPromise = fetchGzJson("./data/cards.json.gz");
  }
  return _cardIndexPromise;
}

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

export async function loadScryfallSets() {
  return fetchGzJson("./data/sets.json.gz");
}
