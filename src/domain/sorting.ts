// Sorting utilities for cards and review rows.
// All comparisons are pure functions with no side effects, making them safe
// to use in Array.sort() callbacks anywhere in the domain layer.

// Compares two collector number strings in display order.
// Handles numeric collector numbers (e.g. "10" < "20"), non-numeric variants
// (e.g. "A001", "★"), and empty values (empty sorts last).
// Used as the primary sort key when displaying cards within a set.
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

// Sorts a flat list of card objects for display inside a set's card list modal.
// Primary: collector number (numeric-aware). Secondary: name. Tertiary: foil last.
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

// Sorts the "needs review" table rows (cards with missing edition code or
// unresolvable set metadata). Not exported — only used by sortNeedsReviewRows.
// Order: edition name → set code → collector number → card name → language.
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

// Public wrapper around compareNeedsReviewRows that returns a new sorted array
// without mutating the input. Called by parseRows() after both error-card
// lists are merged.
export function sortNeedsReviewRows(rows) {
  return [...rows].sort(compareNeedsReviewRows);
}
