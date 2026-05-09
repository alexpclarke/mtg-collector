// Set metadata resolution: normalizes Scryfall set data into lookup maps
// used during CSV parsing to resolve edition codes and names.

// Normalises a set name to a lowercase, whitespace-collapsed string.
// Used as a consistent key for name-based lookups so that minor
// punctuation/spacing differences don’t cause misses.
export function normalizeSetName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Resolves an edition code from a CSV row to its canonical Scryfall parent
// set code. Handles three edge cases that appear in real CLZ/Moxfield exports:
//   - Underscore-separated codes ("m21_promos" → try "m21" and "promos")
//   - Arena edition suffixes ("123e" → try "123d")
//   - Fallback to the raw lowercased code if no alias is found.
export function resolveParentSetCode(editionCode, parentCodeByAlias) {
  const normalized = String(editionCode || "").trim().toLowerCase();
  const candidates = [normalized];
  if (normalized.includes("_")) {
    const [prefix, suffix] = normalized.split("_", 2);
    candidates.push(prefix, suffix);
  }
  if (normalized.endsWith("e") && /^\d+$/.test(normalized.slice(0, -1))) {
    candidates.push(`${normalized}d`);
  }
  for (const c of candidates) {
    if (parentCodeByAlias[c]) return parentCodeByAlias[c];
  }
  return normalized;
}

// Resolves a raw edition code + edition name pair from a CSV row to a
// canonical { code, name } using the Scryfall lookup maps.
// Falls back to name-based lookup when the code alone doesn’t match,
// which handles cases where the CSV has a human-readable edition name
// but an unrecognised or stale code.
export function normalizeInventorySet(editionCode, editionName, parentCodeByAlias, setNameByCode, codeByNormalizedName) {
  let code = resolveParentSetCode(editionCode, parentCodeByAlias);
  const normalizedEditionName = normalizeSetName(editionName);
  if ((!setNameByCode[code] || code === String(editionCode || "").trim().toLowerCase()) && normalizedEditionName) {
    code = codeByNormalizedName[normalizedEditionName] || code;
  }
  const name = setNameByCode[code] || editionName || code;
  return { code, name };
}

// Processes the raw Scryfall sets array into a collection of lookup maps
// used throughout CSV parsing:
//   parentCodeByAlias  — maps any code/alias → the canonical parent set code
//   setNameByCode      — maps canonical code → human-readable set name
//   codeByNormalizedName — maps normalised set name → canonical code (name fallback)
//   yearByCode         — maps code → release year (integer)
//   dateByCode         — maps code → full ISO release date ("YYYY-MM-DD")
//   metaByCode         — maps code → { setType, hasParentSet }
//   metaByName         — maps normalised name → { year, releasedAt, setType, hasParentSet }
// Called once per run() invocation with the freshly loaded sets.json.gz data.
export function buildSetMappings(scryfallSets) {
  const parentCodeByAlias = {};
  const setNameByCode = {};
  const codeByNormalizedName = {};
  const yearByCode = {};
  const dateByCode = {};
  const metaByCode = {};
  const metaByName = {};

  for (const setData of scryfallSets) {
    const code = (setData.code || "").trim().toLowerCase();
    const name = (setData.name || "").trim();
    if (code && name) setNameByCode[code] = name;
    if (code && name) codeByNormalizedName[normalizeSetName(name)] = code;
  }

  for (const setData of scryfallSets) {
    const code = (setData.code || "").trim().toLowerCase();
    if (!code) continue;

    const parent = (setData.parent_set_code || "").trim().toLowerCase() || code;
    const releasedAt = (setData.released_at || "").trim();
    const year = releasedAt.length >= 4 ? Number(releasedAt.slice(0, 4)) : null;
    const setType = (setData.set_type || "").trim().toLowerCase();
    const hasParentSet = Boolean((setData.parent_set_code || "").trim());

    for (const field of ["code", "mtgo_code", "arena_code"]) {
      const alias = (setData[field] || "").trim().toLowerCase();
      if (!alias) continue;
      parentCodeByAlias[alias] = parent;
      if (year) yearByCode[alias] = year;
      if (releasedAt.length === 10) dateByCode[alias] = releasedAt;
      metaByCode[alias] = { setType, hasParentSet };
    }

    const normalizedName = normalizeSetName(setData.name);
    if (normalizedName) {
      const candidate = {
        year: year || null,
        releasedAt: releasedAt.length === 10 ? releasedAt : null,
        setType,
        hasParentSet,
      };
      const existing = metaByName[normalizedName];
      if (!existing) {
        metaByName[normalizedName] = candidate;
      } else {
        // Prefer earlier release when multiple sets share the same display name.
        const existingDate = existing.releasedAt || "9999-12-31";
        const candidateDate = candidate.releasedAt || "9999-12-31";
        if (candidateDate < existingDate) {
          metaByName[normalizedName] = candidate;
        }
      }
    }
  }

  return { parentCodeByAlias, setNameByCode, codeByNormalizedName, yearByCode, dateByCode, metaByCode, metaByName };
}
