export interface AdvancedSetting<T> {
  readonly id: string;
  readonly label: string;
  readonly tooltipText: string;
  readonly defaultValue: T;
  normalize?(_value: T): T;
}