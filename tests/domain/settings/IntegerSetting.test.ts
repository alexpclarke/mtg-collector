import test from "node:test";
import assert from "node:assert/strict";
import { IntegerSetting } from "../../../src/domain/settings/IntegerSetting.ts";

const integerSetting = new IntegerSetting("capacity", "Capacity", "Box capacity", 5, 2, 8);

const integerNormalizationCases = [
  { description: "a non-finite value", rawValue: Number.NaN, expectedValue: 2 },
  { description: "a value below the minimum", rawValue: 1, expectedValue: 2 },
  { description: "a fractional value", rawValue: 5.9, expectedValue: 5 },
  { description: "a value above the maximum", rawValue: 9, expectedValue: 8 },
];

for (const { description, rawValue, expectedValue } of integerNormalizationCases) {
  test(`given ${description} when normalizing an integer setting then it is normalized`, () => {
    assert.equal(integerSetting.normalize(rawValue), expectedValue);
  });
}

test("given no maximum when normalizing an integer setting then values above the minimum are not capped", () => {
  const setting = new IntegerSetting("capacity", "Capacity", "Box capacity", 5, 2);

  assert.equal(setting.normalize(100), 100);
});
