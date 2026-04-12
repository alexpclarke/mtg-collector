const { createApp, ref, computed } = Vue;
import { compareCollectorNumbers, sortCardsForDisplay, sortNeedsReviewRows } from "./domain/sorting.js";
import { splitSetIntoCapacityChunks } from "./domain/packing.js";
import { resetRunOutputRefs, applyRunFailure } from "./ui/run-state.js";
import { loadScryfallSets, resolveCardsByScryfallId, applyScryfallResolutionToRows } from "./services/scryfall.js";

const DEFAULT_BOX_CAPACITY = 1200;
const SPECIAL_BOX_LABEL = "misc.";
const SPECIAL_BOX_KEYWORDS = ["the list", "mystery booster", "memorabilia"];
const PROMO_FAMILY_KEYWORDS = [
  "promo",
  "standard showdown",
  "grand prix",
  "magic fest",
  "command fest",
  "wpn",
  "gateway",
  "intro pack alternate art",
  "launch parties",
  "friday night magic",
  "love your lgs",
];
const FOREIGN_BOX_LABEL = "Foreign";
const FOREIGN_LANGUAGE_ENGLISH = "English";
const LANGUAGE_ABBREVIATIONS = {
  English: "EN",
  French: "FR",
  Italian: "IT",
  Japanese: "JP",
  Russian: "RU",
  Spanish: "ES",
};

function rowHasBinderTag(row) {
  const tags = (row.Tags || "").trim();
  if (!tags) return false;
  return tags
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes("binder");
}

function colorForCode(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash << 5) - hash + code.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 48%)`;
}

function languageAbbreviation(language) {
  return LANGUAGE_ABBREVIATIONS[language] || (language || "UN").slice(0, 2).toUpperCase();
}

function formatSetCode(code) {
  return String(code || "").toUpperCase();
}

function isForeignBoxLabel(label) {
  return String(label || "").startsWith(FOREIGN_BOX_LABEL);
}

function normalizeSetName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatForeignCodes(sets) {
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

function extractYear(text) {
  const m = /\b(19|20)\d{2}\b/.exec(String(text || ""));
  return m ? Number(m[0]) : null;
}

function resolveParentSetCode(editionCode, parentCodeByAlias) {
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

function normalizeInventorySet(editionCode, editionName, parentCodeByAlias, setNameByCode, codeByNormalizedName) {
  let code = resolveParentSetCode(editionCode, parentCodeByAlias);
  const normalizedEditionName = normalizeSetName(editionName);
  if ((!setNameByCode[code] || code === String(editionCode || "").trim().toLowerCase()) && normalizedEditionName) {
    code = codeByNormalizedName[normalizedEditionName] || code;
  }
  const name = setNameByCode[code] || editionName || code;
  return { code, name };
}

function buildSetMappings(scryfallSets) {
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

function isSpecialSet(setInfo) {
  const nameLower = String(setInfo.name || setInfo.code || "").toLowerCase();
  if (SPECIAL_BOX_KEYWORDS.some((k) => nameLower.includes(k))) return true;
  const setType = String(setInfo.setType || "").toLowerCase();
  const hasParentSet = Boolean(setInfo.hasParentSet);
  if (setType === "memorabilia") return true;
  if (setType === "promo" && !hasParentSet) return true;
  if (!setType && PROMO_FAMILY_KEYWORDS.some((k) => nameLower.includes(k))) return true;
  return false;
}

function releaseSortKey(setInfo) {
  const releasedAt = String(setInfo.releasedAt || "");
  if (releasedAt.length === 10) return `${releasedAt}|${setInfo.code}`;
  if (setInfo.year) return `${String(setInfo.year).padStart(4, "0")}-12-31|${setInfo.code}`;
  return `9999-12-31|${setInfo.code}`;
}

function addCardToEntry(
  entry,
  cardName,
  count,
  collectorNumber,
  foil,
  scryfallId = null,
  setCode = "",
  setName = "",
  setReleasedAt = null
) {
  if (!entry.cardMap) entry.cardMap = new Map();
  const cardNameTrimmed = String(cardName || "(unknown card)").trim() || "(unknown card)";
  const normalizedSetCode = String(setCode || "").trim().toUpperCase();
  const key = `${cardNameTrimmed}|foil:${foil}|set:${normalizedSetCode}`;
  const existing = entry.cardMap.get(key) || {
    name: cardNameTrimmed,
    count: 0,
    collectorNumber: String(collectorNumber || "").trim(),
    foil,
    scryfallId: String(scryfallId || "").trim() || null,
    setCode: normalizedSetCode,
    setName: String(setName || "").trim() || "",
    setReleasedAt: String(setReleasedAt || "").trim() || null,
  };
  existing.count += count;
  if (!existing.scryfallId) existing.scryfallId = String(scryfallId || "").trim() || null;
  if (!existing.setReleasedAt) existing.setReleasedAt = String(setReleasedAt || "").trim() || null;
  entry.cardMap.set(key, existing);
}

function finalizeCardList(entry) {
  const map = entry.cardMap || new Map();
  entry.cards = sortCardsForDisplay([...map.values()]);
  delete entry.cardMap;
}

function parseRows(rows, mappings) {
  const grouped = new Map();
  const yearsPerCode = new Map();
  const foreign = new Map();
  const missingEditionCards = new Map();
  const unresolvedSetCards = new Map();

  let binderTotal = 0;

  for (const row of rows) {
    const isBinder = rowHasBinderTag(row);
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

    if (language !== FOREIGN_LANGUAGE_ENGLISH) {
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
      addCardToEntry(existing, cardName, count, collectorNumber, foil, scryfallId, formatSetCode(code), name, releasedAt);
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
    addCardToEntry(existing, cardName, count, collectorNumber, foil, scryfallId);
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

function packSetsIntoBoxes(sets, boxCapacity) {
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

  const foreign = capacityAdjustedSets.filter((s) => s.language && s.language !== FOREIGN_LANGUAGE_ENGLISH);
  let remaining = capacityAdjustedSets.filter((s) => !(s.language && s.language !== FOREIGN_LANGUAGE_ENGLISH));

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
    const endYear = Math.max(...boxes[0].sets.map((x) => x.year).filter(Boolean));
    boxes[0].label = endYear === 1993 ? "1993" : `1993-${endYear}`;
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

createApp({
  setup() {
    const file = ref(null);
    const boxCapacity = ref(DEFAULT_BOX_CAPACITY);
    const loading = ref(false);
    const error = ref("");
    const boxes = ref([]);
    const missingEditionList = ref([]);
    const missingEditionTotal = ref(0);
    const binderTotal = ref(0);
    const totalCards = ref(0);
    const hoveredSegment = ref(null);
    const hoverPosition = ref({ x: 0, y: 0 });
    const selectedBoxIndex = ref(null);
    const selectedSetInfo = ref(null);
    const resolutionSummary = ref("");

    const boxCount = computed(() => boxes.value.length);

    function onFileChange(event) {
      file.value = event.target.files?.[0] || null;
    }

    function getTooltipPosition(clientX, clientY) {
      const offset = 16;
      const margin = 8;
      const viewportWidth = window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const tooltipWidth = Math.min(420, Math.max(220, viewportWidth - 32));
      const tooltipHeight = 260;

      const x = Math.min(Math.max(margin, clientX + offset), Math.max(margin, viewportWidth - tooltipWidth - margin));
      const y = Math.min(Math.max(margin, clientY + offset), Math.max(margin, viewportHeight - tooltipHeight - margin));
      return { x, y };
    }

    function onSegmentEnter(boxIndex, segmentIndex, setInfo, event) {
      hoveredSegment.value = { boxIndex, segmentIndex, setInfo };
      if (event?.clientX != null && event?.clientY != null) {
        hoverPosition.value = getTooltipPosition(event.clientX, event.clientY);
      }
    }

    function onSegmentMove(event) {
      if (!hoveredSegment.value) return;
      if (event?.clientX != null && event?.clientY != null) {
        hoverPosition.value = getTooltipPosition(event.clientX, event.clientY);
      }
    }

    function onSegmentLeave(boxIndex, segmentIndex) {
      if (
        hoveredSegment.value &&
        hoveredSegment.value.boxIndex === boxIndex &&
        hoveredSegment.value.segmentIndex === segmentIndex
      ) {
        hoveredSegment.value = null;
      }
    }

    function cardsForBox(box) {
      const setsByIndex = [];
      for (const setInfo of box.sets || []) {
        if (!setInfo.cards || setInfo.cards.length === 0) continue;
        setsByIndex.push({
          setInfo,
          cards: [...setInfo.cards],
          sortKey: setInfo.year || 0,
        });
      }
      setsByIndex.sort((a, b) => a.sortKey - b.sortKey);
      return setsByIndex;
    }

    function foreignCardsBySet(setInfo) {
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

    function openExternalLink(url) {
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    }

    function cardRowKey(card) {
      const name = String(card?.name || "");
      const collector = String(card?.collectorNumber || "");
      const setCode = String(card?.setCode || "");
      const foil = card?.foil ? "foil" : "nonfoil";
      return `${name}|${collector}|${setCode}|${foil}`;
    }

    async function run() {
      error.value = "";
      resolutionSummary.value = "";
      if (!file.value) {
        error.value = "Choose a CSV file first.";
        return;
      }
      if (!boxCapacity.value || boxCapacity.value <= 0) {
        error.value = "Box capacity must be a positive number.";
        return;
      }

      resetRunOutputRefs({
        boxes,
        missingEditionList,
        missingEditionTotal,
        binderTotal,
        totalCards,
        selectedBoxIndex,
        selectedSetInfo,
        hoveredSegment,
      });

      loading.value = true;
      try {
        const [scryfallSets, rows] = await Promise.all([
          loadScryfallSets(),
          new Promise((resolve, reject) => {
            Papa.parse(file.value, {
              header: true,
              skipEmptyLines: true,
              complete: (result) => resolve(result.data),
              error: reject,
            });
          }),
        ]);

        const mappings = buildSetMappings(scryfallSets);
        const firstPass = parseRows(rows, mappings);

        const reviewIds = firstPass.missingEditionList
          .map((item) => String(item.scryfallId || "").trim())
          .filter(Boolean);

        let rowsToParse = rows;
        let unresolvedLookupIds = [];

        if (reviewIds.length) {
          const { resolvedById, unresolvedIds } = await resolveCardsByScryfallId(reviewIds);
          unresolvedLookupIds = unresolvedIds;
          if (Object.keys(resolvedById).length) {
            rowsToParse = applyScryfallResolutionToRows(rows, resolvedById);
          }
        }

        const parsed = parseRows(rowsToParse, mappings);
        const packed = packSetsIntoBoxes(parsed.packable, Number(boxCapacity.value));

        boxes.value = packed;
        selectedBoxIndex.value = null;
        binderTotal.value = parsed.binderTotal;
        missingEditionList.value = parsed.missingEditionList;
        missingEditionTotal.value = parsed.missingEditionTotal;
        totalCards.value = packed.reduce((acc, b) => acc + b.totalCount, 0);

        const firstCount = firstPass.missingEditionTotal;
        const resolvedCount = Math.max(0, firstCount - parsed.missingEditionTotal);
        if (firstCount > 0) {
          const unresolvedPart = unresolvedLookupIds.length
            ? ` ${unresolvedLookupIds.length} Scryfall ID lookups failed.`
            : "";
          resolutionSummary.value = `Resolved ${resolvedCount} review cards by Scryfall ID (${firstCount} -> ${parsed.missingEditionTotal}).${unresolvedPart}`;
        }
      } catch (e) {
        applyRunFailure(
          {
            boxes,
            missingEditionList,
            missingEditionTotal,
            binderTotal,
            totalCards,
            selectedBoxIndex,
            selectedSetInfo,
            hoveredSegment,
            error,
          },
          e
        );
      } finally {
        loading.value = false;
      }
    }

    return {
      file,
      boxCapacity,
      loading,
      error,
      boxes,
      missingEditionList,
      missingEditionTotal,
      resolutionSummary,
      binderTotal,
      totalCards,
      boxCount,
      onFileChange,
      onSegmentEnter,
      onSegmentMove,
      onSegmentLeave,
      cardsForBox,
      foreignCardsBySet,
      cardRowKey,
      openExternalLink,
      selectedBoxIndex,
      selectedSetInfo,
      hoveredSegment,
      hoverPosition,
      run,
      colorForCode,
      formatSetCode,
      isForeignBoxLabel,
      formatForeignCodes,
      languageAbbreviation,
      FOREIGN_BOX_LABEL,
    };
  },
  template: `
    <main class="app-shell cds--content">
      <section class="cds--tile">
        <div class="title-wrap">
          <h1 class="cds--productive-heading-05">Box Packer SPA Prototype</h1>
          <p class="cds--body-long-01">No backend. CSV + Scryfall in the browser.</p>
        </div>

        <div class="controls">
          <div class="file-group">
            <span class="cds--label">Inventory CSV</span>
            <div class="file-row">
              <label class="cds--btn cds--btn--secondary" for="csv-upload">Choose File</label>
              <input
                id="csv-upload"
                class="hidden-file"
                type="file"
                accept=".csv,text/csv"
                @change="onFileChange"
              />
              <span class="file-name">{{ file ? file.name : 'No file selected' }}</span>
            </div>
          </div>

          <div>
            <label class="cds--label" for="capacity">Box capacity</label>
            <input id="capacity" class="cds--text-input" type="number" min="1" v-model.number="boxCapacity" />
          </div>

          <button class="cds--btn cds--btn--primary" @click="run" :disabled="loading">
            {{ loading ? 'Processing...' : 'Run Packing' }}
          </button>
        </div>

        <div v-if="error" class="error cds--inline-notification cds--inline-notification--error" role="alert">
          <div class="cds--inline-notification__details">
            <p class="cds--inline-notification__title">Run failed</p>
            <p class="cds--inline-notification__subtitle">{{ error }}</p>
          </div>
        </div>
      </section>

      <section v-if="boxes.length" class="cds--tile" style="margin-top: 0.75rem;">
        <div class="metrics">
          <div class="cds--tile">
            <div class="metric-title cds--label">Total Cards</div>
            <div class="metric-value cds--productive-heading-03">{{ totalCards }}</div>
          </div>
          <div class="cds--tile">
            <div class="metric-title cds--label">Binder</div>
            <div class="metric-value cds--productive-heading-03">{{ binderTotal }}</div>
          </div>
          <div class="cds--tile">
            <div class="metric-title cds--label">Needs Review</div>
            <div class="metric-value cds--productive-heading-03">{{ missingEditionTotal }}</div>
          </div>
          <div class="cds--tile">
            <div class="metric-title cds--label">Boxes</div>
            <div class="metric-value cds--productive-heading-03">{{ boxCount }}</div>
          </div>
        </div>

        <details v-if="missingEditionList.length" class="missing-list">
          <summary class="cds--productive-heading-02">Needs Review List</summary>
          <p v-if="resolutionSummary" class="cds--body-compact-01 review-resolution-note">{{ resolutionSummary }}</p>
          <table class="missing-table cds--data-table cds--data-table--compact">
            <thead>
              <tr>
                <th>Count</th>
                <th>Name</th>
                <th>Edition</th>
                <th>Language</th>
                <th>Code</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in missingEditionList"
                :key="m.reason + m.name + m.edition + m.language + m.code"
                class="missing-row cds--body-compact-01"
                :class="{ 'missing-row-link': m.scryfallId }"
                :tabindex="m.scryfallId ? 0 : undefined"
                @click="m.scryfallId && openExternalLink('https://scryfall.com/card/' + m.scryfallId)"
                @keydown.enter.prevent="m.scryfallId && openExternalLink('https://scryfall.com/card/' + m.scryfallId)"
                @keydown.space.prevent="m.scryfallId && openExternalLink('https://scryfall.com/card/' + m.scryfallId)"
              >
                <td>{{ m.count }}x</td>
                <td>{{ m.name }}</td>
                <td>{{ m.edition || '(blank edition)' }}</td>
                <td>{{ m.language }}</td>
                <td>{{ m.code || '-' }}</td>
                <td>{{ m.reason }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>

      <section v-for="(box, i) in boxes" :key="i" class="box-card cds--tile">
        <div class="box-top">
          <div class="box-index cds--heading-compact-01">{{ i + 1 }}</div>
          <div class="box-label cds--productive-heading-03" @click="selectedBoxIndex = i" style="cursor: pointer;">{{ box.label }}</div>
          <div class="box-total cds--body-compact-01">{{ box.totalCount }} / {{ boxCapacity }}</div>
        </div>

        <div class="track">
          <div
            v-for="(s, idx) in box.sets"
            :key="idx + s.code"
            class="segment"
            tabindex="0"
            :style="{ width: Math.max(0.2, (s.count / Math.max(boxCapacity, box.totalCount)) * 100) + '%', background: colorForCode((s.language || '') + s.code) }"
            @mouseenter="onSegmentEnter(i, idx, s, $event)"
            @mousemove="onSegmentMove($event)"
            @mouseleave="onSegmentLeave(i, idx)"
            @focus="onSegmentEnter(i, idx, s, $event)"
            @blur="onSegmentLeave(i, idx)"
            @click="selectedSetInfo = s"
            @keydown.enter.prevent="selectedSetInfo = s"
            @keydown.space.prevent="selectedSetInfo = s"
          ></div>
        </div>

        <div class="codes cds--code-snippet" v-if="!isForeignBoxLabel(box.label)">
          {{ box.sets.map(s => formatSetCode(s.code)).join(', ') }}
        </div>
      </section>

      <div
        v-if="hoveredSegment"
        class="segment-tooltip segment-tooltip-floating cds--tile"
        :style="{ left: hoverPosition.x + 'px', top: hoverPosition.y + 'px', borderLeftColor: colorForCode((hoveredSegment.setInfo.language || '') + hoveredSegment.setInfo.code) }"
      >
        <p class="cds--productive-heading-01">{{ hoveredSegment.setInfo.name || formatSetCode(hoveredSegment.setInfo.code) }}</p>
        <div
          v-if="hoveredSegment.setInfo.setType === 'foreign-language'"
          class="segment-tooltip-grid cds--body-compact-01"
        >
          <div class="segment-tooltip-label">Language</div>
          <div>{{ hoveredSegment.setInfo.language || 'Unknown' }}</div>
          <div class="segment-tooltip-label">Count</div>
          <div>{{ hoveredSegment.setInfo.count }}</div>
          <div class="segment-tooltip-label">Sets</div>
          <div>{{ (hoveredSegment.setInfo.codes || []).join(', ') || 'Unknown' }}</div>
        </div>
        <div v-else class="segment-tooltip-grid cds--body-compact-01">
          <div class="segment-tooltip-label">Code</div>
          <div>{{ formatSetCode(hoveredSegment.setInfo.code) }}</div>
          <div class="segment-tooltip-label">Count</div>
          <div>{{ hoveredSegment.setInfo.count }}</div>
          <div class="segment-tooltip-label">Year</div>
          <div>{{ hoveredSegment.setInfo.year || 'Unknown' }}</div>
          <div class="segment-tooltip-label">Release Date</div>
          <div>{{ hoveredSegment.setInfo.releasedAt || 'Unknown' }}</div>
          <div class="segment-tooltip-label">Set Type</div>
          <div>{{ hoveredSegment.setInfo.setType || 'Unknown' }}</div>
        </div>
      </div>

      <div
        v-if="selectedBoxIndex !== null"
        class="modal-backdrop"
        @click="selectedBoxIndex = null"
      >
        <div class="modal-card cds--tile" @click.stop>
          <div class="modal-header">
            <h2 class="cds--productive-heading-03">Box {{ selectedBoxIndex + 1 }}: {{ boxes[selectedBoxIndex]?.label }}</h2>
            <button class="cds--btn cds--btn--ghost modal-close" @click="selectedBoxIndex = null">
              ✕
            </button>
          </div>
          <div class="modal-body">
            <div
              v-for="setGroup in cardsForBox(boxes[selectedBoxIndex])"
              :key="setGroup.setInfo.code"
              class="set-group"
            >
              <div
                class="set-header cds--productive-heading-02 set-header-link"
                @click="selectedSetInfo = setGroup.setInfo"
              >
                {{ setGroup.setInfo.name }} ({{ formatSetCode(setGroup.setInfo.code) }})
              </div>
              <div
                class="card-row cds--body-compact-01"
                v-for="card in setGroup.cards"
                :key="cardRowKey(card)"
              >
                <span class="card-count">{{ card.count }}x</span>
                <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
                <span class="card-name"><a v-if="card.scryfallId" :href="'https://scryfall.com/card/' + card.scryfallId" target="_blank" rel="noopener noreferrer" class="card-link">{{ card.name }}</a><span v-else>{{ card.name }}</span><span v-if="card.foil" class="foil-indicator">★</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="selectedSetInfo !== null"
        class="modal-backdrop"
        @click="selectedSetInfo = null"
      >
        <div class="modal-card cds--tile" @click.stop>
          <div class="modal-header">
            <h2 class="cds--productive-heading-03">{{ selectedSetInfo.name }} ({{ formatSetCode(selectedSetInfo.code) }})</h2>
            <button class="cds--btn cds--btn--ghost modal-close" @click="selectedSetInfo = null">
              ✕
            </button>
          </div>
          <div class="modal-body">
            <template v-if="selectedSetInfo.setType === 'foreign-language'">
              <div
                v-for="setGroup in foreignCardsBySet(selectedSetInfo)"
                :key="setGroup.code + setGroup.name"
                class="set-group"
              >
                <div class="set-header cds--productive-heading-02">{{ setGroup.name }} ({{ setGroup.code }})</div>
                <div
                  class="card-row cds--body-compact-01"
                  v-for="card in setGroup.cards"
                  :key="cardRowKey(card)"
                >
                  <span class="card-count">{{ card.count }}x</span>
                  <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
                  <span class="card-name"><a v-if="card.scryfallId" :href="'https://scryfall.com/card/' + card.scryfallId" target="_blank" rel="noopener noreferrer" class="card-link">{{ card.name }}</a><span v-else>{{ card.name }}</span><span v-if="card.foil" class="foil-indicator">★</span></span>
                </div>
              </div>
            </template>
            <div
              v-else
              class="card-row cds--body-compact-01"
              v-for="card in (selectedSetInfo.cards || [])"
              :key="cardRowKey(card)"
            >
              <span class="card-count">{{ card.count }}x</span>
              <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
              <span class="card-name"><a v-if="card.scryfallId" :href="'https://scryfall.com/card/' + card.scryfallId" target="_blank" rel="noopener noreferrer" class="card-link">{{ card.name }}</a><span v-else>{{ card.name }}</span><span v-if="card.foil" class="foil-indicator">★</span></span>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
}).mount("#app");
