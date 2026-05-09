// Pure layout utilities for the Vue UI layer.
// Computes positions and data structures used to render tooltips and modals.
// No DOM mutations, no Vue refs, no domain logic.

export function getTooltipPosition(clientX, clientY, options = {}) {
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

export function cardsForBox(box) {
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

export function boxModalColumns(box) {
  const groups = cardsForBox(box);
  if (!groups.length) return [];

  // O(n) split-point minimization: find split that minimizes column height difference
  // Estimate visual height: header + cards + spacer (margin) after each set except last in column
  // Assume: header = 0.5, card = 1, spacer = 0.5 (relative units; adjust as needed)
  const HEADER_UNIT = 0.5;
  const CARD_UNIT = 1;
  const SPACER_UNIT = 0.5;
  const groupHeights = groups.map(g => HEADER_UNIT + (g.cards?.length || 0) * CARD_UNIT);
  // Precompute prefix sums for fast column height calculation including spacers
  const prefixHeights = [0];
  for (let i = 0; i < groupHeights.length; ++i) {
    prefixHeights.push(prefixHeights[i] + groupHeights[i]);
  }
  let minDiff = Infinity;
  let bestSplit = 1;
  const n = groups.length;
  for (let split = 1; split <= n; ++split) {
    // left: groups 0..split-1, right: split..n-1
    // Each column gets (count-1) spacers if count > 0
    const leftCount = split;
    const rightCount = n - split;
    const leftHeight = prefixHeights[split] + (leftCount > 1 ? (leftCount - 1) * SPACER_UNIT : 0);
    const rightHeight = prefixHeights[n] - prefixHeights[split] + (rightCount > 1 ? (rightCount - 1) * SPACER_UNIT : 0);
    const diff = Math.abs(leftHeight - rightHeight);
    if (diff < minDiff) {
      minDiff = diff;
      bestSplit = split;
    }
  }
  const firstColumn = groups.slice(0, bestSplit);
  const secondColumn = groups.slice(bestSplit);
  return [firstColumn, secondColumn].filter(col => col.length);
}

export function cardRowKey(card) {
  const name = String(card?.name || "");
  const collector = String(card?.collectorNumber || "");
  const setCode = String(card?.setCode || "");
  const foil = card?.foil ? "foil" : "nonfoil";
  return `${name}|${collector}|${setCode}|${foil}`;
}
