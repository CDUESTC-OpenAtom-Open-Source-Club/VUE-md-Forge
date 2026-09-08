<script setup lang="ts">
/**
 * MdEditor - public Vue 3 component.
 *
 * Thin wrapper over EditorOnly that normalises the
 * v-model / v-model:theme contract.
 */
import { computed } from 'vue';
import EditorOnly from './EditorOnly.vue';

// Note: we deliberately avoid TypeScript type aliases here in script-setup
// body. The Vue SFC parser treats identifiers starting with an uppercase
// letter as element tags, so a generic like `computed<Theme>(...)` or a
// typed cast `: Theme` in arrow parameters breaks compilation. Use raw
// `string` and runtime narrowing instead. The public `Theme` type lives
// in ./core/types.ts.
type ThemeValue = 'typora-light' | 'typora-dark';
function asTheme(v: string): ThemeValue {
  return v === 'typora-dark' ? 'typora-dark' : 'typora-light';
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    theme?: string;
  }>(),
  { theme: 'typora-light' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:theme', value: string): void;
}>();

const themeProxy = computed({
  get: (): ThemeValue => asTheme(props.theme),
  set: (v: ThemeValue) => emit('update:theme', v)
});
</script>

<template>
  <EditorOnly
    :model-value="props.modelValue"
    :theme="themeProxy"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @update:theme="(v) => (themeProxy = v as ThemeValue)"
  />
</template>
