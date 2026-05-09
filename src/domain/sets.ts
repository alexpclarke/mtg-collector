// Set metadata resolution: normalizes Scryfall set data into lookup maps
// used during CSV parsing to resolve edition codes and names.

export function normalizeSetName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

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

export function normalizeInventorySet(editionCode, editionName, parentCodeByAlias, setNameByCode, codeByNormalizedName) {
  let code = resolveParentSetCode(editionCode, parentCodeByAlias);
  const normalizedEditionName = normalizeSetName(editionName);
  if ((!setNameByCode[code] || code === String(editionCode || "").trim().toLowerCase()) && normalizedEditionName) {
    code = codeByNormalizedName[normalizedEditionName] || code;
  }
  const name = setNameByCode[code] || editionName || code;
  return { code, name };
}

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
