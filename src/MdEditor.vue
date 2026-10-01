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
    /**
     * Optional. Pass nothing (or an empty string) for an uncontrolled
     * editor that manages its own draft. Pass a non-empty value AND wire
     * `v-model` to opt into controlled mode where the parent owns the
     * content. Empty `modelValue` is treated the same as omitting the
     * prop because every host we tested that uses `:modelValue=""` is
     * NOT listening for `@update:modelValue`, which under v-model
     * semantics would mean their input gets wiped on the next tick.
     */
    modelValue?: string;
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

// Treat empty string as "no modelValue": let EditorOnly run uncontrolled
// so its internal state (with `initial` + localStorage) survives even
// when the parent isn't echoing updates back. See issue #2.
const effectiveModelValue = computed<string | undefined>(() => {
  if (props.modelValue === undefined) return undefined;
  if (props.modelValue === '') return undefined;
  return props.modelValue;
});
</script>

<template>
  <EditorOnly
    :model-value="effectiveModelValue"
    :theme="themeProxy"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @update:theme="(v) => (themeProxy = v as ThemeValue)"
  />
</template>
