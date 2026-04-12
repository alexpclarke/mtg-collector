// @ts-nocheck
const { createApp, ref, computed, watch, nextTick } = Vue;
import { compareCollectorNumbers, sortCardsForDisplay, sortNeedsReviewRows } from "./domain/sorting.ts";
import { splitSetIntoCapacityChunks } from "./domain/packing.ts";
import { resetRunOutputRefs, applyRunFailure } from "./ui/run-state.ts";
import { loadScryfallSets, resolveCardsByScryfallId, applyScryfallResolutionToRows } from "./services/scryfall.ts";

const DEFAULT_BOX_CAPACITY = 1200;
const DEFAULT_START_YEAR = 1993;
const DEFAULT_BINDER_TAG = "binder";
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
const CARBON_THEME_CLASSES = ["cds--white", "cds--g10", "cds--g90", "cds--g100"];
const SYSTEM_LIGHT_THEME = "cds--white";
const SYSTEM_DARK_THEME = "cds--g100";
const LANGUAGE_ABBREVIATIONS = {
  English: "EN",
  French: "FR",
  Italian: "IT",
  Japanese: "JP",
  Russian: "RU",
  Spanish: "ES",
};

function applyCarbonTheme(themeClass) {
  const nextTheme = CARBON_THEME_CLASSES.includes(themeClass) ? themeClass : SYSTEM_LIGHT_THEME;
  const targets = [document.documentElement, document.body].filter(Boolean);
  for (const target of targets) {
    target.classList.remove(...CARBON_THEME_CLASSES);
    target.classList.add(nextTheme);
  }
}

function currentSystemTheme() {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? SYSTEM_DARK_THEME : SYSTEM_LIGHT_THEME;
}

function initializeSystemThemeSync() {
  const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const syncTheme = () => applyCarbonTheme(currentSystemTheme());
  syncTheme();

  if (!mediaQuery) return;
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", syncTheme);
    return;
  }
  if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(syncTheme);
  }
}

initializeSystemThemeSync();

function rowHasBinderTag(row, binderTag) {
  const tags = (row.Tags || "").trim();
  const normalizedBinderTag = String(binderTag || "").trim().toLowerCase();
  if (!normalizedBinderTag) return false;
  if (!tags) return false;
  return tags
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(normalizedBinderTag);
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

function parseRows(rows, mappings, binderTag) {
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

function packSetsIntoBoxes(sets, boxCapacity, options = {}) {
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
    const firstBoxYears = boxes[0].sets.map((x) => x.year).filter(Boolean);
    const startYear =
      Number.isFinite(options.firstBoxStartYear) && options.firstBoxStartYear > 0
        ? options.firstBoxStartYear
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

createApp({
  setup() {
    const file = ref(null);
    const boxCapacity = ref(DEFAULT_BOX_CAPACITY);
    const loading = ref(false);
    const error = ref("");
    const isFileDragOver = ref(false);
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
    const settingsOpen = ref(false);
    const openSettingsTooltip = ref("");
    const settingsTooltipPosition = ref({ x: 0, y: 0 });
    const startAt1993 = ref(true);
    const binderTag = ref(DEFAULT_BINDER_TAG);
    const reviewOpen = ref(false);
    const boxModalEl = ref(null);
    const setModalEl = ref(null);

    const boxCount = computed(() => boxes.value.length);
    const canRun = computed(() => {
      const capacity = Number(boxCapacity.value);
      return Boolean(file.value) && Number.isFinite(capacity) && capacity > 0;
    });

    function normalizeCapacityValue(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return 1;
      return Math.max(1, Math.trunc(parsed));
    }

    function adjustBoxCapacity(delta) {
      boxCapacity.value = normalizeCapacityValue((Number(boxCapacity.value) || 0) + delta);
    }

    function normalizeBoxCapacity() {
      boxCapacity.value = normalizeCapacityValue(boxCapacity.value);
    }

    function normalizeBinderTag() {
      const normalized = String(binderTag.value || "").trim();
      binderTag.value = normalized || DEFAULT_BINDER_TAG;
    }

    function showSettingsTooltip(key, event) {
      openSettingsTooltip.value = key;
      updateSettingsTooltipPosition(event);
    }

    function hideSettingsTooltip(key) {
      if (openSettingsTooltip.value === key) {
        openSettingsTooltip.value = "";
      }
    }

    function settingsTooltipText(key) {
      if (key === "start-at-1993") {
        return "Checked: first box starts at 1993. Unchecked: starts at your oldest year.";
      }
      if (key === "box-capacity") {
        return "Maximum cards allowed in each packed box. Default is 1200.";
      }
      if (key === "binder-tag") {
        return "Rows with this exact tag in the Tags column are counted as binder cards and excluded from box packing.";
      }
      return "";
    }

    function toggleSettingCheckbox(event, checkboxId) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, label, button, a, [role="button"]')
      ) {
        return;
      }

      const checkbox = document.getElementById(checkboxId);
      if (checkbox instanceof HTMLInputElement && checkbox.type === "checkbox") {
        checkbox.click();
      }
    }

    function focusSettingInput(event) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, label, button, a, select, textarea, [role="button"]')
      ) {
        return;
      }

      if (!(target instanceof Element)) return;
      const settingCard = target.closest('.settings-item');
      if (!settingCard) return;

      const input = settingCard.querySelector('.cds--text-input, .cds--number__input');
      if (input instanceof HTMLElement) {
        input.focus();
      }
    }

    function onFileChange(event) {
      file.value = event.target.files?.[0] || null;
    }

    function onFileDragOver(event) {
      event.preventDefault();
      isFileDragOver.value = true;
    }

    function onFileDragLeave(event) {
      event.preventDefault();
      isFileDragOver.value = false;
    }

    function onFileDrop(event) {
      event.preventDefault();
      isFileDragOver.value = false;
      file.value = event.dataTransfer?.files?.[0] || null;
    }

    function getTooltipPosition(clientX, clientY, options = {}) {
      const offset = options.offset ?? 16;
      const margin = 8;
      const viewportWidth = window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const desiredWidth = options.width ?? 420;
      const minWidth = options.minWidth ?? 220;
      const tooltipWidth = Math.min(desiredWidth, Math.max(minWidth, viewportWidth - 32));
      const tooltipHeight = options.height ?? 260;

      const x = Math.min(Math.max(margin, clientX + offset), Math.max(margin, viewportWidth - tooltipWidth - margin));
      const y = Math.min(Math.max(margin, clientY + offset), Math.max(margin, viewportHeight - tooltipHeight - margin));
      return { x, y };
    }

    function updateSettingsTooltipPosition(event) {
      if (event?.clientX != null && event?.clientY != null) {
        settingsTooltipPosition.value = getTooltipPosition(event.clientX, event.clientY, {
          width: 288,
          minWidth: 224,
          height: 120,
        });
        return;
      }

      const rect = event?.currentTarget?.getBoundingClientRect?.();
      if (rect) {
        settingsTooltipPosition.value = getTooltipPosition(rect.left + rect.width / 2, rect.top + rect.height / 2, {
          width: 288,
          minWidth: 224,
          height: 120,
        });
      }
    }

    function onSegmentEnter(boxIndex, segmentIndex, setInfo, event) {
      hoveredSegment.value = { boxIndex, segmentIndex, setInfo };
      if (event?.clientX != null && event?.clientY != null) {
        hoverPosition.value = getTooltipPosition(event.clientX, event.clientY);
        return;
      }
      const rect = event?.currentTarget?.getBoundingClientRect?.();
      if (rect) {
        hoverPosition.value = getTooltipPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
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

    function isHoveredSegment(boxIndex, segmentIndex) {
      return Boolean(
        hoveredSegment.value &&
        hoveredSegment.value.boxIndex === boxIndex &&
        hoveredSegment.value.segmentIndex === segmentIndex
      );
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
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }

    function cardRowKey(card) {
      const name = String(card?.name || "");
      const collector = String(card?.collectorNumber || "");
      const setCode = String(card?.setCode || "");
      const foil = card?.foil ? "foil" : "nonfoil";
      return `${name}|${collector}|${setCode}|${foil}`;
    }

    function trapModalFocus(event) {
      if (event.key !== "Tab") return;
      const root = event.currentTarget;
      const container = root?.querySelector?.(".cds--modal-container");
      if (!container) return;

      const focusable = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && active === last) {
        first.focus();
        event.preventDefault();
      }
    }

    watch(selectedBoxIndex, async (value) => {
      if (value === null) return;
      await nextTick();
      boxModalEl.value?.focus();
    });

    watch(selectedSetInfo, async (value) => {
      if (!value) return;
      await nextTick();
      setModalEl.value?.focus();
    });

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
        const firstPass = parseRows(rows, mappings, binderTag.value);

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

        const parsed = parseRows(rowsToParse, mappings, binderTag.value);
        const packed = packSetsIntoBoxes(parsed.packable, Number(boxCapacity.value), {
          firstBoxStartYear: startAt1993.value ? DEFAULT_START_YEAR : null,
        });

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
      isFileDragOver,
      boxes,
      missingEditionList,
      missingEditionTotal,
      resolutionSummary,
      binderTotal,
      totalCards,
      boxCount,
      canRun,
      onFileChange,
      onFileDragOver,
      onFileDragLeave,
      onFileDrop,
      adjustBoxCapacity,
      normalizeBoxCapacity,
      normalizeBinderTag,
      openSettingsTooltip,
      settingsTooltipPosition,
      showSettingsTooltip,
      hideSettingsTooltip,
      settingsTooltipText,
      updateSettingsTooltipPosition,
      toggleSettingCheckbox,
      focusSettingInput,
      onSegmentEnter,
      onSegmentMove,
      onSegmentLeave,
      isHoveredSegment,
      cardsForBox,
      foreignCardsBySet,
      cardRowKey,
      openExternalLink,
      selectedBoxIndex,
      selectedSetInfo,
      settingsOpen,
      startAt1993,
      binderTag,
      reviewOpen,
      boxModalEl,
      setModalEl,
      hoveredSegment,
      hoverPosition,
      trapModalFocus,
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
      <section class="cds--tile top-box">
        <div class="title-wrap">
          <h1 class="cds--productive-heading-05">MTG Collector</h1>
          <p class="cds--body-long-01">No backend. CSV + Scryfall in the browser.</p>
        </div>

        <div class="controls">
          <div class="cds--file controls-upload">
            <div class="cds--file-container cds--file-container--drop">
              <label
                class="cds--file__drop-container"
                :class="{ 'cds--file__drop-container--drag-over': isFileDragOver }"
                for="csv-upload"
                @dragover="onFileDragOver"
                @dragenter="onFileDragOver"
                @dragleave="onFileDragLeave"
                @drop="onFileDrop"
              >
                <p class="cds--file--label">Drag and drop inventory CSV here or click to upload</p>
                <span class="cds--file-filename">{{ file ? file.name : 'No file selected' }}</span>
              </label>
              <input
                id="csv-upload"
                class="cds--file-input"
                type="file"
                accept=".csv,text/csv"
                @change="onFileChange"
              />
            </div>
          </div>
        </div>

        <ul class="cds--accordion settings-accordion">
          <li class="cds--accordion__item" :class="{ 'cds--accordion__item--active': settingsOpen }">
            <button type="button" class="cds--accordion__heading" :aria-expanded="String(settingsOpen)" @click="settingsOpen = !settingsOpen">
              <svg class="cds--accordion__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3 5.3 3.7 9.6 8l-4.3 4.3.7.7L11 8z" />
              </svg>
              <p class="cds--accordion__title">Advanced settings (optional)</p>
            </button>
            <div class="cds--accordion__wrapper">
              <div class="cds--accordion__content">
                <div class="settings-grid" @click="focusSettingInput($event)">
                  <div class="cds--layer settings-item settings-item--toggle" @click="toggleSettingCheckbox($event, 'start-at-1993')">
                    <div class="settings-item-head">
                      <span class="cds--label">Start at 1993</span>
                      <span class="settings-info">
                        <span
                          class="cds--tooltip-trigger__wrapper settings-info-trigger"
                          tabindex="0"
                          aria-label="Start at 1993 setting info"
                          :aria-describedby="openSettingsTooltip === 'start-at-1993' ? 'settings-tooltip' : undefined"
                          @mouseenter="showSettingsTooltip('start-at-1993', $event)"
                          @mouseleave="hideSettingsTooltip('start-at-1993')"
                          @mousemove="updateSettingsTooltipPosition($event)"
                          @focus="showSettingsTooltip('start-at-1993', $event)"
                          @blur="hideSettingsTooltip('start-at-1993')"
                          @keydown.esc.stop.prevent="hideSettingsTooltip('start-at-1993')"
                        >
                          <svg class="settings-info-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 13a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"></path>
                            <path d="M8.5 11h-1V7h1zm0-6h-1V4h1z"></path>
                          </svg>
                        </span>
                      </span>
                    </div>

                    <div class="cds--checkbox-wrapper settings-input settings-toggle-row">
                      <input id="start-at-1993" class="cds--checkbox" type="checkbox" v-model="startAt1993" />
                      <label for="start-at-1993" class="cds--checkbox-label">Enabled</label>
                    </div>
                  </div>

                  <div class="cds--layer settings-item">
                    <div class="settings-item-head">
                      <label class="cds--label" for="capacity">Box capacity</label>
                      <span class="settings-info">
                        <span
                          class="cds--tooltip-trigger__wrapper settings-info-trigger"
                          tabindex="0"
                          aria-label="Box capacity setting info"
                          :aria-describedby="openSettingsTooltip === 'box-capacity' ? 'settings-tooltip' : undefined"
                          @mouseenter="showSettingsTooltip('box-capacity', $event)"
                          @mouseleave="hideSettingsTooltip('box-capacity')"
                          @mousemove="updateSettingsTooltipPosition($event)"
                          @focus="showSettingsTooltip('box-capacity', $event)"
                          @blur="hideSettingsTooltip('box-capacity')"
                          @keydown.esc.stop.prevent="hideSettingsTooltip('box-capacity')"
                        >
                          <svg class="settings-info-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 13a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"></path>
                            <path d="M8.5 11h-1V7h1zm0-6h-1V4h1z"></path>
                          </svg>
                        </span>
                      </span>
                    </div>
                    <div class="cds--number settings-input" data-number>
                      <div class="cds--number__input-wrapper">
                        <input
                          id="capacity"
                          class="cds--number__input"
                          type="number"
                          min="1"
                          step="1"
                          v-model.number="boxCapacity"
                          @blur="normalizeBoxCapacity"
                        />
                        <div class="cds--number__controls">
                          <button
                            type="button"
                            class="cds--number__control-btn down-icon"
                            aria-label="Decrease box capacity"
                            @click="adjustBoxCapacity(-1)"
                          >
                            <svg class="down-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                              <path d="M4 8h8v1H4z"></path>
                            </svg>
                          </button>
                          <button
                            type="button"
                            class="cds--number__control-btn up-icon"
                            aria-label="Increase box capacity"
                            @click="adjustBoxCapacity(1)"
                          >
                            <svg class="up-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                              <path d="M8 4h1v4h4v1H9v4H8V9H4V8h4z"></path>
                            </svg>
                          </button>
                          <span class="cds--number__rule-divider"></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="cds--layer settings-item">
                    <div class="settings-item-head">
                      <label class="cds--label" for="binder-tag">Binder tag</label>
                      <span class="settings-info">
                        <span
                          class="cds--tooltip-trigger__wrapper settings-info-trigger"
                          tabindex="0"
                          aria-label="Binder tag setting info"
                          :aria-describedby="openSettingsTooltip === 'binder-tag' ? 'settings-tooltip' : undefined"
                          @mouseenter="showSettingsTooltip('binder-tag', $event)"
                          @mouseleave="hideSettingsTooltip('binder-tag')"
                          @mousemove="updateSettingsTooltipPosition($event)"
                          @focus="showSettingsTooltip('binder-tag', $event)"
                          @blur="hideSettingsTooltip('binder-tag')"
                          @keydown.esc.stop.prevent="hideSettingsTooltip('binder-tag')"
                        >
                          <svg class="settings-info-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 13a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"></path>
                            <path d="M8.5 11h-1V7h1zm0-6h-1V4h1z"></path>
                          </svg>
                        </span>
                      </span>
                    </div>
                    <div class="cds--text-input-wrapper settings-input">
                      <input
                        id="binder-tag"
                        class="cds--text-input"
                        type="text"
                        v-model.trim="binderTag"
                        @blur="normalizeBinderTag"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>

        <div class="controls-secondary">
          <button class="cds--btn cds--btn--primary controls-run" @click="run" :disabled="loading || !canRun">
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

      <section v-if="missingEditionList.length" class="cds--tile section-gap">
        <ul class="cds--accordion cds--accordion--start">
          <li class="cds--accordion__item" :class="{ 'cds--accordion__item--active': reviewOpen }">
            <button type="button" class="cds--accordion__heading" :aria-expanded="String(reviewOpen)" @click="reviewOpen = !reviewOpen">
              <svg class="cds--accordion__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3 5.3 3.7 9.6 8l-4.3 4.3.7.7L11 8z" />
              </svg>
              <p class="cds--accordion__title">Needs Review List ({{ missingEditionTotal }})</p>
            </button>
            <div class="cds--accordion__wrapper">
              <div class="cds--accordion__content">
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
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="boxes.length" class="cds--tile section-gap">
        <div class="metrics">
          <div class="cds--tile">
            <div class="metric-title cds--label">Cards in boxes</div>
            <div class="metric-value cds--productive-heading-03">{{ totalCards }}</div>
          </div>
          <div class="cds--tile">
            <div class="metric-title cds--label">Cards in binder</div>
            <div class="metric-value cds--productive-heading-03">{{ binderTotal }}</div>
          </div>
        </div>
      </section>

      <section v-for="(box, i) in boxes" :key="i" class="box-card cds--tile">
        <div class="box-top">
          <div class="box-index cds--heading-compact-01">{{ i + 1 }}</div>
          <button type="button" class="box-label-link cds--link cds--productive-heading-03" @click="selectedBoxIndex = i">{{ box.label }}</button>
          <div class="box-total cds--body-compact-01">{{ box.totalCount }} / {{ boxCapacity }}</div>
        </div>

        <div class="track">
          <div
            v-for="(s, idx) in box.sets"
            :key="idx + s.code"
            :class="['segment', { 'segment-active': isHoveredSegment(i, idx) }]"
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
          <template v-for="(s, idx) in box.sets" :key="idx + '-code-' + s.code">
            <button
              type="button"
              class="code-link cds--link"
              :class="{ 'active-code-link': isHoveredSegment(i, idx) }"
              :style="{ '--set-code-color': colorForCode((s.language || '') + s.code) }"
              @mouseenter="onSegmentEnter(i, idx, s, $event)"
              @mousemove="onSegmentMove($event)"
              @mouseleave="onSegmentLeave(i, idx)"
              @focus="onSegmentEnter(i, idx, s, $event)"
              @blur="onSegmentLeave(i, idx)"
              @click="selectedSetInfo = s"
              @keydown.enter.prevent="selectedSetInfo = s"
              @keydown.space.prevent="selectedSetInfo = s"
            >
              {{ formatSetCode(s.code) }}
            </button><span v-if="idx < box.sets.length - 1">, </span>
          </template>
        </div>
      </section>

      <div
        v-if="openSettingsTooltip"
        id="settings-tooltip"
        class="settings-tooltip segment-tooltip-floating cds--tile cds--body-compact-01"
        :style="{ left: settingsTooltipPosition.x + 'px', top: settingsTooltipPosition.y + 'px' }"
        role="tooltip"
      >
        {{ settingsTooltipText(openSettingsTooltip) }}
      </div>

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
        ref="boxModalEl"
        class="cds--modal is-visible"
        role="dialog"
        aria-modal="true"
        aria-labelledby="box-modal-heading"
        tabindex="-1"
        @click.self="selectedBoxIndex = null"
        @keydown.esc="selectedBoxIndex = null"
        @keydown.tab="trapModalFocus"
      >
        <div class="cds--modal-container cds--modal-container--lg">
          <div class="cds--modal-header">
            <h2 id="box-modal-heading" class="cds--modal-header__heading">Box {{ selectedBoxIndex + 1 }}: {{ boxes[selectedBoxIndex]?.label }}</h2>
            <button type="button" class="cds--modal-close-button cds--modal-close" aria-label="Close modal" @click="selectedBoxIndex = null">
              <svg class="cds--modal-close__icon" focusable="false" preserveAspectRatio="xMidYMid meet" width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M24 9.4 22.6 8 16 14.6 9.4 8 8 9.4 14.6 16 8 22.6 9.4 24 16 17.4 22.6 24 24 22.6 17.4 16 24 9.4z" />
              </svg>
            </button>
          </div>
          <div class="cds--modal-content app-modal-content">
            <div
              v-for="setGroup in cardsForBox(boxes[selectedBoxIndex])"
              :key="setGroup.setInfo.code"
              class="set-group"
            >
              <button
                type="button"
                class="set-header set-header-link cds--link cds--productive-heading-02"
                @click="selectedSetInfo = setGroup.setInfo"
              >
                {{ setGroup.setInfo.name }} ({{ formatSetCode(setGroup.setInfo.code) }})
              </button>
              <div
                class="card-row cds--body-compact-01"
                v-for="card in setGroup.cards"
                :key="cardRowKey(card)"
                :class="{ 'card-row-link': card.scryfallId }"
                :tabindex="card.scryfallId ? 0 : undefined"
                @click="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
                @keydown.enter.prevent="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
                @keydown.space.prevent="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
              >
                <span class="card-count">{{ card.count }}x</span>
                <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
                <span class="card-name" :class="{ 'card-link': card.scryfallId }">{{ card.name }}<span v-if="card.foil" class="foil-indicator">★</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="selectedSetInfo !== null"
        ref="setModalEl"
        class="cds--modal is-visible"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-modal-heading"
        tabindex="-1"
        @click.self="selectedSetInfo = null"
        @keydown.esc="selectedSetInfo = null"
        @keydown.tab="trapModalFocus"
      >
        <div class="cds--modal-container cds--modal-container--lg">
          <div class="cds--modal-header">
            <h2 id="set-modal-heading" class="cds--modal-header__heading">{{ selectedSetInfo.name }} ({{ formatSetCode(selectedSetInfo.code) }})</h2>
            <button type="button" class="cds--modal-close-button cds--modal-close" aria-label="Close modal" @click="selectedSetInfo = null">
              <svg class="cds--modal-close__icon" focusable="false" preserveAspectRatio="xMidYMid meet" width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M24 9.4 22.6 8 16 14.6 9.4 8 8 9.4 14.6 16 8 22.6 9.4 24 16 17.4 22.6 24 24 22.6 17.4 16 24 9.4z" />
              </svg>
            </button>
          </div>
          <div class="cds--modal-content app-modal-content">
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
                  :class="{ 'card-row-link': card.scryfallId }"
                  :tabindex="card.scryfallId ? 0 : undefined"
                  @click="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
                  @keydown.enter.prevent="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
                  @keydown.space.prevent="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
                >
                  <span class="card-count">{{ card.count }}x</span>
                  <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
                  <span class="card-name" :class="{ 'card-link': card.scryfallId }">{{ card.name }}<span v-if="card.foil" class="foil-indicator">★</span></span>
                </div>
              </div>
            </template>
            <div
              v-else
              class="card-row cds--body-compact-01"
              v-for="card in (selectedSetInfo.cards || [])"
              :key="cardRowKey(card)"
              :class="{ 'card-row-link': card.scryfallId }"
              :tabindex="card.scryfallId ? 0 : undefined"
              @click="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
              @keydown.enter.prevent="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
              @keydown.space.prevent="card.scryfallId && openExternalLink('https://scryfall.com/card/' + card.scryfallId)"
            >
              <span class="card-count">{{ card.count }}x</span>
              <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
              <span class="card-name" :class="{ 'card-link': card.scryfallId }">{{ card.name }}<span v-if="card.foil" class="foil-indicator">★</span></span>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
}).mount("#app");
