import type { AdvancedSetting } from "./AdvancedSetting.ts";

export class TextSetting implements AdvancedSetting<string> {
  readonly id: string;
  readonly label: string;
  readonly tooltipText: string;
  readonly defaultValue: string;
  readonly placeholder: string;
  readonly isToggle = false;
  readonly type = "text";

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
