import { CheckboxSetting } from "./CheckboxSetting.ts";

export class StartAt1993Setting extends CheckboxSetting {
  constructor() {
    super(
      "start-at-1993",
      "Start at 1993",
      "Checked: first box starts at 1993. Unchecked: starts at your oldest year.",
      true,
    );
  }
}
