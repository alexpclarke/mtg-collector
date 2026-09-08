import type { AdvancedSetting } from "./AdvancedSetting.ts";

export class CheckboxSetting implements AdvancedSetting<boolean> {
  readonly id: string;
  readonly label: string;
  readonly tooltipText: string;
  readonly defaultValue: boolean;

  constructor(id: string, label: string, tooltipText: string, defaultValue: boolean) {
    this.id = id;
    this.label = label;
    this.tooltipText = tooltipText;
    this.defaultValue = defaultValue;
  }
}
