/**
 * Shared public types for vue-md-forge.
 *
 * Kept minimal on purpose — most consumers only need `Theme`.
 */

export type Theme = 'typora-light' | 'typora-dark';

export interface MdEditorProps {
  modelValue: string;
  theme?: Theme;
}

export interface MdEditorEmits {
  (e: 'update:modelValue', value: string): void;
  (e: 'update:theme', value: Theme): void;
}
