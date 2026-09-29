import test from "node:test";
import assert from "node:assert/strict";
import { TextSetting } from "../../../src/domain/settings/TextSetting.ts";

class ConcreteTextSetting extends TextSetting {}

const textSetting = new ConcreteTextSetting("label", "Label", "Box label", "Default label");

const textNormalizationCases = [
  { description: "surrounding whitespace", rawValue: "  Box label  ", expectedValue: "Box label" },
  { description: "an empty value", rawValue: "", expectedValue: "Default label" },
  { description: "a whitespace-only value", rawValue: " \t ", expectedValue: "Default label" },
];

for (const { description, rawValue, expectedValue } of textNormalizationCases) {
  test(`given ${description} when normalizing a text setting then it is normalized`, () => {
    assert.equal(textSetting.normalize(rawValue), expectedValue);
  });
}
