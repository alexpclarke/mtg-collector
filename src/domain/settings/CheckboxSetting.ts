import type { AdvancedSetting } from "./AdvancedSetting.ts";

// Abstract class rather than interface so that `instanceof CheckboxSetting`
// works at runtime in the Vue template for type-based rendering.
export abstract class CheckboxSetting implements AdvancedSetting<boolean> {
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
