<script setup lang="ts">
import { CheckboxSetting } from "./CheckboxSetting.ts";

const props = defineProps<{
  setting: CheckboxSetting;
  modelValue: boolean;
  isTooltipOpen: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "show-tooltip": [id: string, event: MouseEvent | FocusEvent];
  "hide-tooltip": [id: string];
  "move-tooltip": [event: MouseEvent];
}>();

function handleCardClick(event: MouseEvent) {
  const target = event.target as Element;
  if (target.closest('input, label, button, a, [role="button"]')) return;
  const checkbox = document.getElementById(props.setting.id);
  if (checkbox instanceof HTMLInputElement && checkbox.type === "checkbox") {
    checkbox.click();
  }
}
</script>

<template>
  <div
    class="cds--layer settings-item settings-item--toggle"
    @click="handleCardClick"
  >
    <div class="settings-item-head">
      <span class="cds--label">{{ setting.label }}</span>
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

    <div class="cds--checkbox-wrapper settings-input settings-toggle-row">
      <input
        :id="setting.id"
        class="cds--checkbox"
        type="checkbox"
        :checked="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <label :for="setting.id" class="cds--checkbox-label">Enabled</label>
    </div>
  </div>
</template>
