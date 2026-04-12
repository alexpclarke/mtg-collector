export function compareCollectorNumbers(a, b) {
  const valueA = String(a || "").trim();
  const valueB = String(b || "").trim();
  if (!valueA && !valueB) return 0;
  if (!valueA) return 1;
  if (!valueB) return -1;

  const numA = Number.parseInt(valueA, 10);
  const numB = Number.parseInt(valueB, 10);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;

  return valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: "base" });
}

export function sortCardsForDisplay(cards) {
  return [...cards].sort((a, b) => {
    const collectorOrder = compareCollectorNumbers(a.collectorNumber, b.collectorNumber);
    if (collectorOrder !== 0) return collectorOrder;

    const nameOrder = String(a.name || "").localeCompare(String(b.name || ""));
    if (nameOrder !== 0) return nameOrder;

    const foilA = Boolean(a.foil);
    const foilB = Boolean(b.foil);
    if (foilA === foilB) return 0;
    return foilA ? 1 : -1;
  });
}

function compareNeedsReviewRows(a, b) {
  const editionOrder = String(a.edition || "").localeCompare(String(b.edition || ""));
  if (editionOrder !== 0) return editionOrder;

  const codeOrder = String(a.code || "").localeCompare(String(b.code || ""));
  if (codeOrder !== 0) return codeOrder;

  const collectorOrder = compareCollectorNumbers(a.collectorNumber, b.collectorNumber);
  if (collectorOrder !== 0) return collectorOrder;

  const nameOrder = String(a.name || "").localeCompare(String(b.name || ""));
  if (nameOrder !== 0) return nameOrder;

  return String(a.language || "").localeCompare(String(b.language || ""));
}

export function sortNeedsReviewRows(rows) {
  return [...rows].sort(compareNeedsReviewRows);
}
