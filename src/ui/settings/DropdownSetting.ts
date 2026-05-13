import type { AdvancedSetting } from "./AdvancedSetting.ts";

export class DropdownSetting<T> implements AdvancedSetting<T> {
  readonly id: string;
  readonly label: string;
  readonly tooltipText: string;
  readonly defaultValue: T;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly isToggle = false;
  readonly type = "dropdown";

  constructor(
    id: string,
    label: string,
    tooltipText: string,
    defaultValue: T,
    options: ReadonlyArray<{ readonly value: T; readonly label: string }>,
  ) {
    this.id = id;
    this.label = label;
    this.tooltipText = tooltipText;
    this.defaultValue = defaultValue;
    this.options = options;
  }
}
