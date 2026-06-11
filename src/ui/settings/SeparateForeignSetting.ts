import { CheckboxSetting } from "./CheckboxSetting.ts";

export class SeparateForeignSetting extends CheckboxSetting {
  constructor() {
    super(
      "separate-foreign",
      "Separate foreign language cards",
      "When enabled, non-native-language cards are grouped together and packed into dedicated Foreign boxes at the end. When disabled, they are packed in with their set by release year.",
      true,
    );
  }
}
