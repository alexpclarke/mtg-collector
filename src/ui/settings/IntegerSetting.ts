import type { AdvancedSetting } from "./AdvancedSetting.ts";

export class IntegerSetting implements AdvancedSetting<number> {
  readonly id: string;
  readonly label: string;
  readonly tooltipText: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number | null;
  readonly step: number;
  readonly isToggle = false;
  readonly type = "integer";

  constructor(
    id: string,
    label: string,
    tooltipText: string,
    defaultValue: number,
    min = 1,
    max: number | null = null,
    step = 1,
  ) {
    this.id = id;
    this.label = label;
    this.tooltipText = tooltipText;
    this.defaultValue = defaultValue;
    this.min = min;
    this.max = max;
    this.step = step;
  }

  normalize(rawValue: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return this.min;
    const clamped = this.max !== null ? Math.min(parsed, this.max) : parsed;
    return Math.max(this.min, Math.trunc(clamped));
  }
}
