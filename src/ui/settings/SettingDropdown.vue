<script setup lang="ts" generic="T extends string">
import { DropdownSetting } from "../../domain/settings/DropdownSetting.ts";

defineProps<{
  setting: DropdownSetting<T>;
  modelValue: T;
  isTooltipOpen: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: T];
  "show-tooltip": [id: string, event: MouseEvent | FocusEvent];
  "hide-tooltip": [id: string];
  "move-tooltip": [event: MouseEvent];
}>();
</script>

<template>
  <div class="cds--layer settings-item">
    <div class="settings-item-head">
      <label class="cds--label" :for="setting.id">{{ setting.label }}</label>
      <span class="settings-info">
        <span
          class="cds--tooltip-trigger__wrapper settings-info-trigger"
          tabindex="0"
          :aria-label="setting.label + ' setting info'"
          :aria-describedby="isTooltipOpen ? 'settings-tooltip' : undefined"
          @mouseenter="emit('show-tooltip', setting.id, $event)"
          @mouseleave="emit('hide-tooltip', setting.id)"
          @mousemove="emit('move-tooltip', $event)"
          @focus="emit('show-tooltip', setting.id, $event)"
          @blur="emit('hide-tooltip', setting.id)"
          @keydown.esc.stop.prevent="emit('hide-tooltip', setting.id)"
        >
          <svg class="settings-info-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 13a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"></path>
            <path d="M8.5 11h-1V7h1zm0-6h-1V4h1z"></path>
          </svg>
        </span>
      </span>
    </div>

    <div class="cds--select settings-input">
      <div class="cds--select-input__wrapper">
        <select
          :id="setting.id"
          class="cds--select-input"
          :value="modelValue"
          @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as T)"
        >
          <option v-for="opt in setting.options" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
        </select>
        <svg class="cds--select__arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z"/>
        </svg>
      </div>
    </div>
  </div>
</template>
