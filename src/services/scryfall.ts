// @ts-nocheck
const SCRYFALL_SETS_URL = "https://api.scryfall.com/sets";
const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const CACHE_KEY = "box-packer-scryfall-sets-v1";
const CARD_CACHE_KEY = "box-packer-scryfall-cards-by-id-v1";
const SETS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CARD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CARD_NEGATIVE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 75;
const BATCH_RATE_LIMIT_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function fetchCardsBatch(ids, maxAttempts = 3) {
  if (!ids.length) return { ok: true, cards: [], notFound: [] };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(SCRYFALL_COLLECTION_URL, {
        method: "POST",
        headers: { 
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifiers: ids.map((id) => ({ id })) }),
      });

      if (response.ok) {
        const payload = await response.json();
        const cards = (payload?.data || []).map((card) => ({
          id: String(card?.id || "").trim(),
          code: String(card?.set || "").trim().toLowerCase(),
          name: String(card?.set_name || "").trim(),
          collectorNumber: String(card?.collector_number || "").trim(),
          language: String(card?.lang || "").trim(),
        }));
        const notFound = (payload?.not_found || []).map((card) => String(card?.id || card?.name || "").trim()).filter(Boolean);
        return { ok: true, cards, notFound };
      }

      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        await sleep(BATCH_RATE_LIMIT_MS * attempt * attempt);
        continue;
      }

      return { ok: false, reason: `http-${response.status}` };
    } catch {
      if (attempt < maxAttempts) {
        await sleep(BATCH_RATE_LIMIT_MS * attempt * attempt);
        continue;
      }
      return { ok: false, reason: "network" };
    }
  }

  return { ok: false, reason: "unknown" };
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

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    const result = await fetchCardsBatch(batch);
    
    if (result.ok) {
      for (const card of result.cards) {
        if (card.code && card.name) {
          const value = {
            code: card.code,
            name: card.name,
            collectorNumber: card.collectorNumber,
            language: card.language,
            fetchedAt: Date.now(),
          };
          resolvedById[card.id] = value;
          cache[card.id] = value;
        }
      }
      
      for (const notFoundId of result.notFound) {
        unresolvedIds.push(notFoundId);
        cache[notFoundId] = {
          failedAt: Date.now(),
          reason: "not-found",
        };
      }
    } else {
      for (const id of batch) {
        unresolvedIds.push(id);
        cache[id] = {
          failedAt: Date.now(),
          reason: result.reason || "unknown",
        };
      }
    }
    
    if (i + BATCH_SIZE < queue.length) {
      await sleep(BATCH_RATE_LIMIT_MS);
    }
  }

  saveCardCache(cache);
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
    if (!String(next["Card Number"] || "").trim() && resolved.collectorNumber) {
      next["Card Number"] = resolved.collectorNumber;
    }
    if (!String(next.Language || "").trim() && resolved.language) {
      next.Language = resolved.language;
    }
    return next;
  });
}

export async function loadScryfallSets() {
  let cached = null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {
    cached = null;
  }

  const now = Date.now();
  if (Array.isArray(cached?.data) && Number.isFinite(cached?.fetchedAt) && now - cached.fetchedAt <= SETS_CACHE_TTL_MS) {
    return cached.data;
  }

  const headers = { Accept: "application/json" };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

  try {
    const response = await fetch(SCRYFALL_SETS_URL, { headers });

    if (response.status === 304 && Array.isArray(cached?.data)) {
      cached.fetchedAt = now;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
      return cached.data;
    }

    if (!response.ok) {
      if (Array.isArray(cached?.data)) return cached.data;
      throw new Error(`Scryfall sets fetch failed: ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.data)) throw new Error("Unexpected Scryfall payload");

    const next = {
      data: payload.data,
      etag: response.headers.get("ETag") || "",
      lastModified: response.headers.get("Last-Modified") || "",
      fetchedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    return next.data;
  } catch (err) {
    if (Array.isArray(cached?.data)) return cached.data;
    throw err;
  }
}
