// Low-level set splitting utility.
// When a single set has more cards than a box can hold, this function breaks
// it into sequential chunks that each fit within boxCapacity. The card list
// is preserved across chunks so the box modal can still display individual cards.
// Called by packSetsIntoBoxes (via parsing.ts) before any grouping occurs.
export function splitSetIntoCapacityChunks(setInfo, boxCapacity) {
  const total = Number(setInfo?.count || 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  if (total <= boxCapacity) return [setInfo];

  const cards = Array.isArray(setInfo.cards) ? setInfo.cards : [];
  if (!cards.length) {
    const chunks = [];
    let remaining = total;
    while (remaining > 0) {
      const take = Math.min(boxCapacity, remaining);
      chunks.push({ ...setInfo, count: take, cards: [] });
      remaining -= take;
    }
    return chunks;
  }

  const chunks = [];
  let currentCards = [];
  let currentCount = 0;

  function pushCurrentChunk() {
    if (currentCount <= 0) return;
    chunks.push({ ...setInfo, count: currentCount, cards: currentCards });
    currentCards = [];
    currentCount = 0;
  }

  for (const card of cards) {
    let remainingCardCount = Number(card?.count || 0);
    if (!Number.isFinite(remainingCardCount) || remainingCardCount <= 0) continue;

    while (remainingCardCount > 0) {
      const spaceLeft = boxCapacity - currentCount;
      if (spaceLeft <= 0) {
        pushCurrentChunk();
        continue;
      }

      const take = Math.min(spaceLeft, remainingCardCount);
      currentCards.push({ ...card, count: take });
      currentCount += take;
      remainingCardCount -= take;

      if (currentCount >= boxCapacity) {
        pushCurrentChunk();
      }
    }
  }

  pushCurrentChunk();
  return chunks;
}
