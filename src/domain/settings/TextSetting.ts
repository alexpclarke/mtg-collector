import type { AdvancedSetting } from "./AdvancedSetting.ts";

// Abstract class rather than interface so that `instanceof TextSetting`
// works at runtime in the Vue template for type-based rendering.
export abstract class TextSetting implements AdvancedSetting<string> {
  readonly id: string;
  readonly label: string;
  readonly tooltipText: string;
  readonly defaultValue: string;
  readonly placeholder: string;

  constructor(
    id: string,
    label: string,
    tooltipText: string,
    defaultValue: string,
    placeholder = "",
  ) {
    this.id = id;
    this.label = label;
    this.tooltipText = tooltipText;
    this.defaultValue = defaultValue;
    this.placeholder = placeholder;
  }

  normalize(rawValue: string): string {
    const trimmed = String(rawValue || "").trim();
    return trimmed || this.defaultValue;
  }
}
