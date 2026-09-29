import test from "node:test";
import assert from "node:assert/strict";
import { packSetsIntoBoxes, parseRows } from "../../src/domain/parsing.ts";
import { applyResolutionToInventoryRows } from "../../src/services/scryfall.ts";

function makeSet(code, year, count) {
  return { code, name: `Set ${code}`, count, year };
}

test("given sets spanning many years when packed then no box exceeds capacity", () => {
  // Setup
  const sets = [];
  for (let year = 2020; year <= 2029; year += 1) {
    sets.push(makeSet(`y${year}a`, year, 4));
    sets.push(makeSet(`y${year}b`, year, 3));
  }

  // Exercise
  const boxes = packSetsIntoBoxes(sets, 10);

  // Verify
  for (const box of boxes) {
    assert.ok(box.totalCount <= 10, `box "${box.label}" exceeded capacity: ${box.totalCount}`);
  }
});

test("given a box labelled with a year range when packed then every set from the years strictly inside that range is contained in that same box, not split into another box", () => {
  // Setup
  const sets = [];
  for (let year = 2020; year <= 2029; year += 1) {
    sets.push(makeSet(`y${year}a`, year, 1));
    sets.push(makeSet(`y${year}b`, year, 1));
  }

  // Exercise
  const boxes = packSetsIntoBoxes(sets, 10);

  // Verify
  const yearRangeLabel = /^(\d{4})-(\d{4})$/;
  let sawMultiYearBox = false;

  for (const box of boxes) {
    const match = yearRangeLabel.exec(box.label);
    if (!match) continue;

    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (endYear - startYear < 2) continue; // no years strictly between start and end

    sawMultiYearBox = true;

    for (let year = startYear + 1; year < endYear; year += 1) {
      const expectedSets = sets.filter((s) => s.year === year);
      const setsInThisBox = box.sets.filter((s) => s.year === year);

      assert.equal(
        setsInThisBox.length,
        expectedSets.length,
        `box "${box.label}" is missing sets from year ${year} — they must have been split into another box`
      );

      const otherBoxes = boxes.filter((b) => b !== box);
      for (const otherBox of otherBoxes) {
        const leaked = otherBox.sets.some((s) => s.year === year);
        assert.ok(!leaked, `year ${year} sets leaked into box "${otherBox.label}" instead of staying in "${box.label}"`);
      }
    }
  }

  assert.ok(sawMultiYearBox, "test setup should have produced at least one box spanning 3+ years");
});

test("given a set with no resolved year when packing then a descriptive error is thrown", () => {
  // Setup
  const sets = [makeSet("abc", 2020, 5), makeSet("def", null, 5)];

  // Exercise & Verify
  assert.throws(() => packSetsIntoBoxes(sets, 10), /unresolved year/i);
});

test("given an unsupported packing strategy when packing then a descriptive error is thrown", () => {
  const sets = [makeSet("abc", 2020, 5)];

  assert.throws(
    () => packSetsIntoBoxes(sets, 10, { packingStrategy: "unknown" }),
    /invalid packingStrategy/i,
  );
});

test("given a set that is both special and foreign-language when packing then it is routed to the Foreign box, not the misc. box", () => {
  // Setup
  const sets = [{ code: "sld", name: "Secret Lair Drop", count: 3, year: 2021, language: "Japanese" }];

  // Exercise
  const boxes = packSetsIntoBoxes(sets, 10);

  // Verify
  assert.equal(boxes.length, 1);
  assert.match(boxes[0].label, /^Foreign/);
});

test("given a non-finite or non-positive box capacity when packing then a descriptive error is thrown", () => {
  // Setup
  const sets = [makeSet("abc", 2020, 5)];

  // Exercise & Verify
  assert.throws(() => packSetsIntoBoxes(sets, 0), /boxCapacity/i);
  assert.throws(() => packSetsIntoBoxes(sets, -5), /boxCapacity/i);
  assert.throws(() => packSetsIntoBoxes(sets, NaN), /boxCapacity/i);
});

test("given a firstBoxStartYear that does not match any set in the first box when packing then the override is used verbatim in the label", () => {
  // Setup
  const sets = [makeSet("abc", 2018, 5)];

  // Exercise
  const boxes = packSetsIntoBoxes(sets, 10, { firstBoxStartYear: 2030 });

  // Verify
  assert.equal(boxes[0].label, "2030-2018");
});

test("given raw rows for distinct Order of Leitbur prints when parsed after Scryfall resolution then they remain separate cards", () => {
  const rawRows = [
    {
      Count: "1",
      "Tradelist Count": "1",
      Name: "Order of Leitbur",
      Edition: "Fallen Empires",
      "Edition Code": "fe",
      "Card Number": "163",
      Language: "English",
      Foil: "",
      "Scryfall ID": "ebd6e51e-f042-4673-a898-291607105829",
    },
    {
      Count: "1",
      "Tradelist Count": "1",
      Name: "Order of Leitbur",
      Edition: "Fallen Empires",
      "Edition Code": "fe",
      "Card Number": "165",
      Language: "English",
      Foil: "",
      "Scryfall ID": "1373dea4-3565-4612-8505-ab8fba3ddb67",
    },
  ];
  const resolvedRows = applyResolutionToInventoryRows(rawRows, {
    "ebd6e51e-f042-4673-a898-291607105829": {
      code: "fem",
      name: "Fallen Empires",
      collectorNumber: "16a",
      language: "en",
    },
    "1373dea4-3565-4612-8505-ab8fba3ddb67": {
      code: "fem",
      name: "Fallen Empires",
      collectorNumber: "16c",
      language: "en",
    },
  });
  const mappings = {
    parentCodeByAlias: { fem: "fem" },
    setNameByCode: { fem: "Fallen Empires" },
    codeByNormalizedName: { "fallen empires": "fem" },
    yearByCode: { fem: 1994 },
    dateByCode: { fem: "1994-11-01" },
    metaByCode: { fem: { setType: "expansion", hasParentSet: false } },
    metaByName: { "fallen empires": { year: 1994, releasedAt: "1994-11-01", setType: "expansion", hasParentSet: false } },
  };

  // Exercise
  const result = parseRows(resolvedRows, mappings);

  // Verify
  assert.equal(result.packable.length, 1);
  const [set] = result.packable;
  assert.equal(set.cards.length, 2, "16a and 16c should remain separate cards, not merged into one");

  const collectorNumbers = set.cards.map((card) => card.collectorNumber).sort();
  assert.deepEqual(collectorNumbers, ["16a", "16c"]);

  const scryfallIds = set.cards.map((card) => card.scryfallId).sort();
  assert.deepEqual(scryfallIds, ["1373dea4-3565-4612-8505-ab8fba3ddb67", "ebd6e51e-f042-4673-a898-291607105829"]);

  for (const card of set.cards) {
    assert.equal(card.count, 1, "each distinct print's count should not be summed with the other's");
  }
});

test("given a box whose running total lands exactly on capacity when packing then the next set starts a new box instead of overfilling it", () => {
  // Setup
  const sets = [makeSet("aaa", 2020, 4), makeSet("bbb", 2020, 6), makeSet("ccc", 2021, 1)];

  // Exercise
  const boxes = packSetsIntoBoxes(sets, 10);

  // Verify
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].totalCount, 10);
  assert.deepEqual(boxes[0].sets.map((s) => s.code).sort(), ["aaa", "bbb"]);
  assert.equal(boxes[1].totalCount, 1);
  assert.deepEqual(boxes[1].sets.map((s) => s.code), ["ccc"]);
});

test("given a year whose largest sets don't fit but a smaller set later in the same year would top off the box exactly when packing then the smaller set is pulled forward instead of leaving the box under-filled", () => {
  // Setup
  const sets = [makeSet("big1", 2020, 30), makeSet("big2", 2020, 25), makeSet("small1", 2020, 20), makeSet("small2", 2020, 4), makeSet("small3", 2020, 1)];

  // Exercise
  const boxes = packSetsIntoBoxes(sets, 50, { packingStrategy: "optimized" });

  // Verify
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].totalCount, 50);
  assert.deepEqual(boxes[0].sets.map((s) => s.code).sort(), ["big1", "small1"]);
  assert.equal(boxes[1].totalCount, 30);
  assert.deepEqual(boxes[1].sets.map((s) => s.code).sort(), ["big2", "small2", "small3"]);
});

test("given chronological strategy is selected when packing then sets fill boxes in release-date order", () => {
  const sets = [
    { ...makeSet("later", 2020, 4), releasedAt: "2020-06-01" },
    { ...makeSet("oldest", 2020, 6), releasedAt: "2020-01-01" },
    { ...makeSet("middle", 2020, 4), releasedAt: "2020-03-01" },
  ];

  const boxes = packSetsIntoBoxes(sets, 10, { packingStrategy: "chronological" });

  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes[0].sets.map((set) => set.code), ["oldest", "middle"]);
  assert.deepEqual(boxes[1].sets.map((set) => set.code), ["later"]);
});
