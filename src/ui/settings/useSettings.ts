// Composable that owns all advanced-settings state and behaviour.
// Keeps reactive values, snapshot management, UI event handlers, and
// the SETTINGS definition out of main.ts.

import { ref, reactive, computed } from "vue";
import { getTooltipPosition } from "../layout.ts";
import { Language } from "../../domain/language.ts";
import { CheckboxSetting } from "../../domain/settings/CheckboxSetting.ts";
import { StartAt1993Setting } from "../../domain/settings/StartAt1993Setting.ts";
import { SeparateForeignSetting } from "../../domain/settings/SeparateForeignSetting.ts";
import { ResolveScryfallSetting } from "../../domain/settings/ResolveScryfallSetting.ts";
import { IntegerSetting } from "../../domain/settings/IntegerSetting.ts";
import { TextSetting } from "../../domain/settings/TextSetting.ts";
import { DropdownSetting } from "../../domain/settings/DropdownSetting.ts";

export const SETTINGS = [
  new StartAt1993Setting(),
  new IntegerSetting(
    "box-capacity",
    "Box capacity",
    "Maximum cards allowed in each packed box. Default is 1100.",
    1100,
    1,
    null,
    1,
  ),
  new SeparateForeignSetting(),
  new DropdownSetting(
    "native-language",
    "Native language",
    "Cards in this language are treated as your native collection. Cards in any other language are routed to the Foreign box when separation is enabled.",
    Language.English.name,
    Language.getNames().map((n) => ({ value: n, label: n })),
  ),
  new ResolveScryfallSetting(),
];

export const SETTINGS_BY_ID = Object.fromEntries(SETTINGS.map((s) => [s.id, s]));

export function useSettings() {
  const settingRefs = reactive(Object.fromEntries(SETTINGS.map((s) => [s.id, s.defaultValue])));
  const activeSettings = ref(Object.fromEntries(SETTINGS.map((s) => [s.id, s.defaultValue])));
  const settingsOpen = ref(false);
  const openSettingsTooltip = ref("");
  const settingsTooltipPosition = ref({ x: 0, y: 0 });

  // Resolves the tooltip text for whichever settings entry is currently open.
  const activeTooltipText = computed(
    () => SETTINGS_BY_ID[openSettingsTooltip.value]?.tooltipText ?? "",
  );

  // Copies current live values into the snapshot, called after a successful run.
  function snapshotSettings() {
    activeSettings.value = Object.fromEntries(SETTINGS.map((s) => [s.id, settingRefs[s.id]]));
  }

  // Delegates blur normalisation to the setting's own normalize() method.
  function normalizeSettingValue(settingId) {
    const setting = SETTINGS_BY_ID[settingId];
    if (setting?.normalize) {
      settingRefs[settingId] = setting.normalize(settingRefs[settingId]);
    }
  }

  // Increments or decrements the box capacity by delta (used by +/- buttons).
  function adjustBoxCapacity(delta) {
    settingRefs["box-capacity"] = (Number(settingRefs["box-capacity"]) || 0) + delta;
    normalizeSettingValue("box-capacity");
  }

  // Records which settings tooltip is open and positions it near the trigger.
  function showSettingsTooltip(key, event) {
    openSettingsTooltip.value = key;
    updateSettingsTooltipPosition(event);
  }

  // Clears the open tooltip if it matches key (prevents closing unrelated ones).
  function hideSettingsTooltip(key) {
    if (openSettingsTooltip.value === key) {
      openSettingsTooltip.value = "";
    }
  }

  function updateSettingsTooltipPosition(event) {
    if (event?.clientX != null && event?.clientY != null) {
      settingsTooltipPosition.value = getTooltipPosition(event.clientX, event.clientY, {
        width: 288,
        minWidth: 224,
        height: 120,
      });
      return;
    }
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (rect) {
      settingsTooltipPosition.value = getTooltipPosition(rect.left + rect.width / 2, rect.top + rect.height / 2, {
        width: 288,
        minWidth: 224,
        height: 120,
      });
    }
  }

  // Allows clicking anywhere in a settings card row to toggle its checkbox,
  // while still letting clicks on interactive children behave normally.
  function toggleSettingCheckbox(event, checkboxId) {
    const target = event.target;
    if (target instanceof Element && target.closest('input, label, button, a, [role="button"]')) {
      return;
    }
    const checkbox = document.getElementById(checkboxId);
    if (checkbox instanceof HTMLInputElement && checkbox.type === "checkbox") {
      checkbox.click();
    }
  }

  // Focuses the text/number input inside a settings card when the card area is clicked.
  function focusSettingInput(event) {
    const target = event.target;
    if (target instanceof Element && target.closest('input, label, button, a, select, textarea, [role="button"]')) {
      return;
    }
    if (!(target instanceof Element)) return;
    const settingCard = target.closest(".settings-item");
    if (!settingCard) return;
    const input = settingCard.querySelector(".cds--text-input, .cds--number__input, .cds--select-input");
    if (input instanceof HTMLSelectElement) {
      input.click();
    } else if (input instanceof HTMLElement) {
      input.focus();
    }
  }

  return {
    // State
    SETTINGS,
    SETTINGS_BY_ID,
    settingRefs,
    activeSettings,
    settingsOpen,
    openSettingsTooltip,
    settingsTooltipPosition,
    // Setting class constructors (needed for template instanceof checks)
    CheckboxSetting,
    IntegerSetting,
    TextSetting,
    DropdownSetting,
    activeTooltipText,
    // Methods
    snapshotSettings,
    normalizeSettingValue,
    adjustBoxCapacity,
    showSettingsTooltip,
    hideSettingsTooltip,
    updateSettingsTooltipPosition,
    toggleSettingCheckbox,
    focusSettingInput,
  };
}
