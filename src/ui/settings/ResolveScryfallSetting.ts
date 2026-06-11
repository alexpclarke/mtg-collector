import { CheckboxSetting } from "./CheckboxSetting.ts";

export class ResolveScryfallSetting extends CheckboxSetting {
  constructor() {
    super(
      "resolve-scryfall",
      "Resolve collector numbers from Scryfall",
      "When enabled, collector numbers are resolved from Scryfall for accuracy. When disabled, the input values are used as-is.",
      true,
    );
  }
}
