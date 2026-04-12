const SCRYFALL_SETS_URL = "https://api.scryfall.com/sets";
const SCRYFALL_CARD_BY_ID_URL = "https://api.scryfall.com/cards";
const CACHE_KEY = "box-packer-scryfall-sets-v1";
const CARD_CACHE_KEY = "box-packer-scryfall-cards-by-id-v1";

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
    return parsed && typeof parsed === "object" ? parsed : {};
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

async function fetchCardByScryfallId(id, maxAttempts = 3) {
  const trimmed = String(id || "").trim();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${SCRYFALL_CARD_BY_ID_URL}/${encodeURIComponent(trimmed)}`, {
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        const payload = await response.json();
        return {
          ok: true,
          value: {
            code: String(payload?.set || "").trim().toLowerCase(),
            name: String(payload?.set_name || "").trim(),
            collectorNumber: String(payload?.collector_number || "").trim(),
            language: String(payload?.lang || "").trim(),
          },
        };
      }

      if (response.status === 404) {
        return { ok: false, reason: "not-found" };
      }

      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        await sleep(250 * attempt * attempt);
        continue;
      }

      return { ok: false, reason: `http-${response.status}` };
    } catch {
      if (attempt < maxAttempts) {
        await sleep(250 * attempt * attempt);
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
    } else {
      queue.push(id);
    }
  }

  const concurrency = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const id = queue[index];
      const result = await fetchCardByScryfallId(id);
      if (result.ok && result.value.code && result.value.name) {
        const value = {
          code: result.value.code,
          name: result.value.name,
          collectorNumber: result.value.collectorNumber,
          language: result.value.language,
          fetchedAt: Date.now(),
        };
        resolvedById[id] = value;
        cache[id] = value;
      } else {
        unresolvedIds.push(id);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
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

  const headers = { Accept: "application/json" };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

  try {
    const response = await fetch(SCRYFALL_SETS_URL, { headers });

    if (response.status === 304 && Array.isArray(cached?.data)) {
      cached.fetchedAt = Date.now();
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
