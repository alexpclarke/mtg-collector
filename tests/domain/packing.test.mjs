import test from "node:test";
import assert from "node:assert/strict";
import { splitSetIntoCapacityChunks } from "../../src/domain/packing.js";

test("given an oversized set when chunking by capacity then full chunks are created first and a final remainder chunk is left", () => {
  const setInfo = {
    code: "rix",
    name: "Rivals of Ixalan",
    count: 8,
    cards: [{ name: "Test Massive Card", collectorNumber: "1", foil: false, count: 8 }],
  };

  const chunks = splitSetIntoCapacityChunks(setInfo, 3);

  assert.deepEqual(chunks.map((chunk) => chunk.count), [3, 3, 2]);
  assert.deepEqual(
    chunks.map((chunk) => chunk.cards.reduce((sum, card) => sum + card.count, 0)),
    [3, 3, 2]
  );
});

test("given a set that fits capacity when chunking then the original set is kept as a single chunk", () => {
  const setInfo = {
    code: "rix",
    name: "Rivals of Ixalan",
    count: 3,
    cards: [{ name: "Test Card", collectorNumber: "1", foil: false, count: 3 }],
  };

  const chunks = splitSetIntoCapacityChunks(setInfo, 3);

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], setInfo);
});
