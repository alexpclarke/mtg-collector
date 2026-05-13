// Common interface for all Advanced Settings panel entries.
// Carries the static definition of a setting — label, tooltip, default value —
// not the reactive state (that stays in main.ts as Vue refs).

export interface AdvancedSetting<T> {
  readonly id: string;
  readonly label: string;
  readonly tooltipText: string;
  readonly defaultValue: T;
  readonly isToggle: boolean;
  readonly type: string;
  normalize?(_value: T): T;
}
