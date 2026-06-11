<script setup lang="ts">
import { TextSetting } from "../../domain/settings/TextSetting.ts";

defineProps<{
  setting: TextSetting;
  modelValue: string;
  isTooltipOpen: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
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

    <div class="cds--text-input-wrapper settings-input">
      <input
        :id="setting.id"
        class="cds--text-input"
        type="text"
        :placeholder="setting.placeholder"
        :value="modelValue"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @blur="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>
