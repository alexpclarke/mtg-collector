// CSV row parsing and box packing orchestration.
// Transforms raw inventory rows into grouped, sorted sets and packed boxes.
// Also provides formatting helpers for foreign-language set display.

import { compareCollectorNumbers, sortCardsForDisplay, sortNeedsReviewRows } from "./sorting.ts";
import { splitSetIntoCapacityChunks } from "./packing.ts";
import { normalizeInventorySet, normalizeSetName } from "./sets.ts";
import {
  LANGUAGES,
  FOREIGN_LANGUAGE_ENGLISH,
  SPECIAL_BOX_LABEL,
  FOREIGN_BOX_LABEL,
  SPECIAL_BOX_CODES,
  SPECIAL_BOX_KEYWORDS,
  PROMO_FAMILY_KEYWORDS,
} from "./constants.ts";

export function rowHasBinderTag(row, binderTag) {
  const tags = (row.Tags || "").trim();
  const normalizedBinderTag = String(binderTag || "").trim().toLowerCase();
  if (!normalizedBinderTag) return false;
  if (!tags) return false;
  return tags
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(normalizedBinderTag);
}

export function languageAbbreviation(language) {
  return LANGUAGES[language]?.abbreviation || (language || "UN").slice(0, 2).toUpperCase();
}

export function formatSetCode(code) {
  return String(code || "").toUpperCase();
}

export function extractYear(text) {
  const m = /\b(19|20)\d{2}\b/.exec(String(text || ""));
  return m ? Number(m[0]) : null;
}

export function isSpecialSet(setInfo) {
  const codeLower = String(setInfo.code || "").toLowerCase();
  if (SPECIAL_BOX_CODES.includes(codeLower)) return true;
  const nameLower = String(setInfo.name || setInfo.code || "").toLowerCase();
  if (SPECIAL_BOX_KEYWORDS.some((k) => nameLower.includes(k))) return true;
  const setType = String(setInfo.setType || "").toLowerCase();
  const hasParentSet = Boolean(setInfo.hasParentSet);
  if (setType === "memorabilia") return true;
  if (setType === "promo" && !hasParentSet) return true;
  if (!setType && PROMO_FAMILY_KEYWORDS.some((k) => nameLower.includes(k))) return true;
  return false;
}

export function releaseSortKey(setInfo) {
  const releasedAt = String(setInfo.releasedAt || "");
  if (releasedAt.length === 10) return `${releasedAt}|${setInfo.code}`;
  if (setInfo.year) return `${String(setInfo.year).padStart(4, "0")}-12-31|${setInfo.code}`;
  return `9999-12-31|${setInfo.code}`;
}

export function addCardToEntry(
  entry,
  cardName,
  count,
  collectorNumber,
  foil,
  scryfallId = null,
  setCode = "",
  setName = "",
  setReleasedAt = null,
  language = ""
) {
  if (!entry.cardMap) entry.cardMap = new Map();
  const cardNameTrimmed = String(cardName || "(unknown card)").trim() || "(unknown card)";
  const normalizedSetCode = String(setCode || "").trim().toUpperCase();
  const normalizedLanguage = String(language || "").trim();
  const key = `${cardNameTrimmed}|foil:${foil}|set:${normalizedSetCode}|lang:${normalizedLanguage}`;
  const existing = entry.cardMap.get(key) || {
    name: cardNameTrimmed,
    count: 0,
    collectorNumber: String(collectorNumber || "").trim(),
    foil,
    scryfallId: String(scryfallId || "").trim() || null,
    setCode: normalizedSetCode,
    setName: String(setName || "").trim() || "",
    setReleasedAt: String(setReleasedAt || "").trim() || null,
    language: normalizedLanguage,
  };
  existing.count += count;
  if (!existing.scryfallId) existing.scryfallId = String(scryfallId || "").trim() || null;
  if (!existing.setReleasedAt) existing.setReleasedAt = String(setReleasedAt || "").trim() || null;
  entry.cardMap.set(key, existing);
}

export function finalizeCardList(entry) {
  const map = entry.cardMap || new Map();
  entry.cards = sortCardsForDisplay([...map.values()]);
  delete entry.cardMap;
}

export function parseRows(rows, mappings, binderTag, separateForeignLanguage = true) {
  const grouped = new Map();
  const yearsPerCode = new Map();
  const foreign = new Map();
  const missingEditionCards = new Map();
  const unresolvedSetCards = new Map();

  let binderTotal = 0;

  for (const row of rows) {
    const isBinder = rowHasBinderTag(row, binderTag);
    const tradelistCountRaw = String(row["Tradelist Count"] || "").trim();
    const count = tradelistCountRaw ? Number(tradelistCountRaw) : 0;
    if (!Number.isFinite(count) || count <= 0) continue;

    if (isBinder) {
      binderTotal += count;
      continue;
    }

    const cardName = String(row.Name || "").trim();
    const editionCodeRaw = String(row["Edition Code"] || "").trim();
    const editionNameRaw = String(row.Edition || "").trim();
    const language = String(row.Language || "").trim() || FOREIGN_LANGUAGE_ENGLISH;
    const collectorNumber = String(row["Card Number"] || "").trim();
    const scryfallId = String(row["Scryfall ID"] || "").trim() || null;

    if (!editionCodeRaw) {
      const key = `${cardName}|${editionNameRaw}|${language}`;
      const prev = missingEditionCards.get(key) || { count: 0, collectorNumber: "", scryfallId: null };
      prev.count += count;
      if (!prev.collectorNumber || compareCollectorNumbers(collectorNumber, prev.collectorNumber) < 0) {
        prev.collectorNumber = collectorNumber;
      }
      if (!prev.scryfallId) prev.scryfallId = scryfallId;
      missingEditionCards.set(key, prev);
      continue;
    }

    const normalized = normalizeInventorySet(
      editionCodeRaw,
      editionNameRaw,
      mappings.parentCodeByAlias,
      mappings.setNameByCode,
      mappings.codeByNormalizedName
    );

    const code = normalized.code;
    const name = normalized.name;

    const nameMatch = mappings.metaByName[normalizeSetName(editionNameRaw)] || null;
    const releaseYear =
      mappings.yearByCode[code] ||
      nameMatch?.year ||
      (extractYear(row["Printing Note"]) || extractYear(name) || extractYear(editionNameRaw));

    const releasedAt =
      mappings.dateByCode[code] ||
      nameMatch?.releasedAt ||
      (releaseYear ? `${String(releaseYear).padStart(4, "0")}-12-31` : null);

    const meta = mappings.metaByCode[code] || nameMatch || { setType: "", hasParentSet: false };

    if (separateForeignLanguage && language !== FOREIGN_LANGUAGE_ENGLISH) {
      const key = language;
      const existing = foreign.get(key) || {
        code: `lang-${languageAbbreviation(language).toLowerCase()}`,
        name: `${language} (Foreign)`,
        count: 0,
        year: null,
        language,
        releasedAt: null,
        setType: "foreign-language",
        hasParentSet: false,
        codes: [],
      };
      existing.count += count;
      existing.codes.push(formatSetCode(code));
      const foil = Boolean(String(row["Foil"] || "").trim());
      addCardToEntry(existing, cardName, count, collectorNumber, foil, scryfallId, formatSetCode(code), name, releasedAt, language);
      foreign.set(key, existing);
      continue;
    }

    if (!releaseYear) {
      const key = `${cardName}|${editionNameRaw || name}|${formatSetCode(code)}|${language}`;
      const prev = unresolvedSetCards.get(key) || { count: 0, collectorNumber: "", scryfallId: null };
      prev.count += count;
      if (!prev.collectorNumber || compareCollectorNumbers(collectorNumber, prev.collectorNumber) < 0) {
        prev.collectorNumber = collectorNumber;
      }
      if (!prev.scryfallId) prev.scryfallId = scryfallId;
      unresolvedSetCards.set(key, prev);
      continue;
    }

    const yset = yearsPerCode.get(code) || new Set();
    yset.add(releaseYear);
    yearsPerCode.set(code, yset);

    const key = `${code}|${releaseYear}`;
    const existing = grouped.get(key) || {
      code,
      name,
      count: 0,
      year: releaseYear,
      releasedAt,
      setType: meta.setType,
      hasParentSet: meta.hasParentSet,
    };
    existing.count += count;
    const foil = Boolean(String(row["Foil"] || "").trim());
    addCardToEntry(existing, cardName, count, collectorNumber, foil, scryfallId, formatSetCode(code), name, releasedAt, language);
    grouped.set(key, existing);
  }

  const packable = [];

  [...grouped.values()]
    .sort((a, b) => a.code.localeCompare(b.code) || a.year - b.year)
    .forEach((s) => {
      const years = yearsPerCode.get(s.code) || new Set();
      const codeLabel = years.size <= 1 ? s.code : `${s.code}@${s.year}`;
      const next = { ...s, code: codeLabel };
      finalizeCardList(next);
      packable.push(next);
    });

  [...foreign.values()]
    .sort((a, b) => a.language.localeCompare(b.language) || a.code.localeCompare(b.code))
    .forEach((s) => {
      s.codes = [...new Set(s.codes)].sort((a, b) => a.localeCompare(b));
      finalizeCardList(s);
      packable.push(s);
    });

  const missingCodeList = [...missingEditionCards.entries()]
    .map(([k, data]) => {
      const [name, edition, language] = k.split("|");
      return {
        name,
        edition,
        language,
        code: "",
        collectorNumber: data.collectorNumber,
        reason: "Missing edition code",
        count: data.count,
        scryfallId: data.scryfallId,
      };
    });

  const unresolvedSetList = [...unresolvedSetCards.entries()]
    .map(([k, data]) => {
      const [name, edition, code, language] = k.split("|");
      return {
        name,
        edition,
        language,
        code,
        collectorNumber: data.collectorNumber,
        reason: "Unresolved set metadata",
        count: data.count,
        scryfallId: data.scryfallId,
      };
    });

  const missingEditionList = sortNeedsReviewRows([...missingCodeList, ...unresolvedSetList]);

  return {
    packable,
    binderTotal,
    missingEditionList,
    missingEditionTotal: missingEditionList.reduce((acc, x) => acc + x.count, 0),
  };
}

export function packSetsIntoBoxes(sets, boxCapacity, options = {}) {
  const { firstBoxStartYear = null, separateForeignLanguage = true } = options;
  function closeBox(contents, total, labelOverride = null) {
    if (labelOverride) return { label: labelOverride, totalCount: total, sets: contents };
    const years = contents.map((x) => x.year).filter(Boolean);
    const start = Math.min(...years);
    const end = Math.max(...years);
    return { label: start === end ? String(start) : `${start}-${end}`, totalCount: total, sets: contents };
  }

  function packGroup(groupSets, label, numberWhenMultiple = false) {
    const out = [];
    let current = [];
    let total = 0;
    for (const s of groupSets) {
      if (current.length && total + s.count > boxCapacity) {
        out.push(closeBox(current, total, label));
        current = [];
        total = 0;
      }
      current.push(s);
      total += s.count;
    }
    if (current.length) out.push(closeBox(current, total, label));

    if (numberWhenMultiple && out.length > 1) {
      for (let i = 0; i < out.length; i += 1) {
        out[i].label = `${label} ${i + 1}`;
      }
    }

    return out;
  }

  const capacityAdjustedSets = sets.flatMap((s) => splitSetIntoCapacityChunks(s, boxCapacity));

  const isForeignSet = (s) => separateForeignLanguage && s.language && s.language !== FOREIGN_LANGUAGE_ENGLISH;
  const foreign = capacityAdjustedSets.filter(isForeignSet);
  let remaining = capacityAdjustedSets.filter((s) => !isForeignSet(s));

  const special = remaining.filter(isSpecialSet);
  remaining = remaining.filter((s) => !isSpecialSet(s));

  const known = remaining.filter((s) => s.year);

  const byYear = new Map();
  for (const s of known) {
    const y = s.year;
    const list = byYear.get(y) || [];
    list.push(s);
    byYear.set(y, list);
  }

  const ordered = [...byYear.keys()]
    .sort((a, b) => a - b)
    .flatMap((y) => byYear.get(y).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)));

  const boxes = [];
  let current = [];
  let total = 0;
  for (const s of ordered) {
    if (current.length && total + s.count > boxCapacity) {
      boxes.push(closeBox(current, total));
      current = [];
      total = 0;
    }
    current.push(s);
    total += s.count;
  }
  if (current.length) boxes.push(closeBox(current, total));

  if (boxes.length && boxes[0].sets.length) {
    const firstBoxYears = boxes[0].sets.map((x) => x.year).filter(Boolean);
    const startYear =
      Number.isFinite(firstBoxStartYear) && firstBoxStartYear > 0
        ? firstBoxStartYear
        : Math.min(...firstBoxYears);
    const endYear = Math.max(...firstBoxYears);
    boxes[0].label = startYear === endYear ? String(startYear) : `${startYear}-${endYear}`;
  }

  if (special.length) {
    special.sort((a, b) => (a.year || 9999) - (b.year || 9999) || b.count - a.count || a.code.localeCompare(b.code));
    boxes.push(...packGroup(special, SPECIAL_BOX_LABEL, true));
  }
  if (foreign.length) {
    foreign.sort((a, b) => a.language.localeCompare(b.language) || a.code.localeCompare(b.code));
    boxes.push(...packGroup(foreign, FOREIGN_BOX_LABEL, true));
  }
  for (const box of boxes) {
    box.sets.sort((a, b) => releaseSortKey(a).localeCompare(releaseSortKey(b)));
  }

  return boxes;
}

export function isForeignBoxLabel(label) {
  return String(label || "").startsWith(FOREIGN_BOX_LABEL);
}

export function formatForeignCodes(sets) {
  return Object.entries(
    sets.reduce((acc, s) => {
      const lang = s.language || "Unknown";
      if (!acc[lang]) acc[lang] = [];
      const codes = Array.isArray(s.codes) && s.codes.length ? s.codes : [s.code];
      acc[lang].push(...codes.map((c) => formatSetCode(c)));
      return acc;
    }, {})
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([lang, codes]) => {
      const deduped = [...new Set(codes)].sort((a, b) => a.localeCompare(b));
      return `${languageAbbreviation(lang)}: ${deduped.join(", ")}`;
    })
    .join("  |  ");
}

export function foreignCardsBySet(setInfo) {
  const groups = new Map();
  for (const card of setInfo?.cards || []) {
    const code = formatSetCode(card.setCode || "");
    const name = String(card.setName || code || "Unknown Set").trim();
    const key = code || name;
    if (!groups.has(key)) {
      groups.set(key, { code: code || "-", name, releasedAt: null, cards: [] });
    }
    const group = groups.get(key);
    group.cards.push(card);
    const candidateDate = String(card.setReleasedAt || "").trim();
    if (candidateDate.length === 10) {
      if (!group.releasedAt || candidateDate < group.releasedAt) {
        group.releasedAt = candidateDate;
      }
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      cards: [...group.cards].sort((a, b) => {
        const collectorOrder = compareCollectorNumbers(a.collectorNumber, b.collectorNumber);
        if (collectorOrder !== 0) return collectorOrder;
        const nameOrder = a.name.localeCompare(b.name);
        if (nameOrder !== 0) return nameOrder;
        return a.foil ? 1 : -1;
      }),
    }))
    .sort(
      (a, b) =>
        releaseSortKey({ releasedAt: a.releasedAt, year: null, code: a.code }).localeCompare(
          releaseSortKey({ releasedAt: b.releasedAt, year: null, code: b.code })
        ) || a.name.localeCompare(b.name)
    );
}
