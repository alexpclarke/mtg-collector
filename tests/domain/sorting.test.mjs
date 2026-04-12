import test from "node:test";
import assert from "node:assert/strict";
import { compareCollectorNumbers, sortCardsForDisplay, sortNeedsReviewRows } from "../../src/domain/sorting.js";

test("given mixed collector numbers when sorting then numeric order is applied before lexical suffix variants", () => {
  const values = ["10", "2", "12a", "12", "1"];
  const sorted = [...values].sort(compareCollectorNumbers);
  assert.deepEqual(sorted, ["1", "2", "10", "12", "12a"]);
});

test("given cards with same and different collectors when sorting for display then order is collector then name with foil last", () => {
  const cards = [
    { name: "Zeta", collectorNumber: "10", foil: false },
    { name: "Alpha", collectorNumber: "2", foil: true },
    { name: "Alpha", collectorNumber: "2", foil: false },
    { name: "Beta", collectorNumber: "2", foil: false },
  ];

  const sorted = sortCardsForDisplay(cards);
  assert.deepEqual(
    sorted.map((card) => `${card.collectorNumber}|${card.name}|${card.foil ? "foil" : "nonfoil"}`),
    ["2|Alpha|nonfoil", "2|Alpha|foil", "2|Beta|nonfoil", "10|Zeta|nonfoil"]
  );
});

test("given needs review rows when sorting then order is edition then code then collector then name then language", () => {
  const rows = [
    { edition: "Set B", code: "bbb", collectorNumber: "3", name: "Gamma", language: "English" },
    { edition: "Set A", code: "aaa", collectorNumber: "10", name: "Beta", language: "English" },
    { edition: "Set A", code: "aaa", collectorNumber: "2", name: "Alpha", language: "Japanese" },
    { edition: "Set A", code: "aaa", collectorNumber: "2", name: "Alpha", language: "English" },
  ];

  const sorted = sortNeedsReviewRows(rows);
  assert.deepEqual(
    sorted.map((row) => `${row.edition}|${row.code}|${row.collectorNumber}|${row.name}|${row.language}`),
    [
      "Set A|aaa|2|Alpha|English",
      "Set A|aaa|2|Alpha|Japanese",
      "Set A|aaa|10|Beta|English",
      "Set B|bbb|3|Gamma|English",
    ]
  );
});
