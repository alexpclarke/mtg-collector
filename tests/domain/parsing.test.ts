import test from "node:test";
import assert from "node:assert/strict";
import { packSetsIntoBoxes } from "../../src/domain/parsing.ts";

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
  const boxes = packSetsIntoBoxes(sets, 50);

  // Verify
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].totalCount, 50);
  assert.deepEqual(boxes[0].sets.map((s) => s.code).sort(), ["big1", "small1"]);
  assert.equal(boxes[1].totalCount, 30);
  assert.deepEqual(boxes[1].sets.map((s) => s.code).sort(), ["big2", "small2", "small3"]);
});
