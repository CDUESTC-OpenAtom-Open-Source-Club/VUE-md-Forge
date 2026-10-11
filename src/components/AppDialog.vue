<script setup lang="ts">
/**
 * AppDialog — renders a DialogService's current state as a styled modal.
 *
 * Per user spec (v0.3.0):
 *   - Single dialog at a time, Teleport to <body>.
 *   - Typora-light/dark aware via mdf-* CSS variables.
 *   - Keyboard: ESC = cancel, Enter on confirm dialog = confirm.
 *     In prompt input, Enter is handled by the input itself (via
 *     @keydown.enter) so we don't double-handle.
 *   - Click outside = cancel (host can later disable).
 *   - No focus trap / no Tab navigation (deferred to v0.4).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { DialogService } from '../core/DialogService';

const props = defineProps<{ service: DialogService }>();

const current = computed(() => props.service.current);
const promptInput = ref('');
const promptEl = ref<HTMLInputElement | null>(null);

watch(current, async (d) => {
  if (d?.kind === 'prompt') {
    promptInput.value = d.defaultValue;
    await nextTick();
    promptEl.value?.focus();
    promptEl.value?.select();
  }
});

function onConfirm() {
  if (!current.value) return;
  if (current.value.kind === 'prompt') {
    props.service.close(promptInput.value);
  } else {
    props.service.close(true);
  }
}

function onCancel() {
  if (!current.value) return;
  props.service.close(current.value.kind === 'prompt' ? null : false);
}

function onKeydown(e: KeyboardEvent) {
  if (!current.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    onCancel();
  } else if (e.key === 'Enter' && current.value.kind === 'confirm') {
    // Prompt's Enter is owned by its <input @keydown.enter>.
    e.preventDefault();
    onConfirm();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg">
      <div
        v-if="current"
        class="dlg-backdrop"
        role="presentation"
        @click.self="onCancel"
      >
        <div
          :key="current.id"
          class="dlg-window"
          :class="`tone-${current.tone}`"
          role="dialog"
          aria-modal="true"
          :aria-label="current.title"
        >
          <header class="dlg-title">{{ current.title }}</header>
          <div class="dlg-body">
            <p v-if="current.message" class="dlg-message">{{ current.message }}</p>
            <input
              v-if="current.kind === 'prompt'"
              ref="promptEl"
              v-model="promptInput"
              class="dlg-input"
              type="text"
              :placeholder="current.placeholder"
              @keydown.enter.prevent="onConfirm"
            />
          </div>
          <footer class="dlg-footer">
            <button class="dlg-btn cancel" type="button" @click="onCancel">
              {{ current.cancelText }}
            </button>
            <button
              class="dlg-btn confirm"
              :class="`tone-${current.tone}`"
              type="button"
              @click="onConfirm"
            >
              {{ current.confirmText }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dlg-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.dlg-window {
  background: var(--mdf-bg, #ffffff);
  color: var(--mdf-fg, #24292f);
  border-radius: 8px;
  min-width: 360px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  font-family: inherit;
}
.dlg-title {
  font-size: 16px;
  font-weight: 600;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--mdf-border, #d0d7de);
}
.dlg-body { padding: 16px 20px; }
.dlg-message {
  margin: 0 0 12px;
  line-height: 1.5;
  white-space: pre-line;
  word-break: break-word;
}
.dlg-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--mdf-border, #d0d7de);
  border-radius: 4px;
  font: inherit;
  background: var(--mdf-bg, #ffffff);
  color: var(--mdf-fg, #24292f);
  box-sizing: border-box;
}
.dlg-input:focus {
  outline: 2px solid var(--mdf-accent, #4183c4);
  outline-offset: -1px;
  border-color: transparent;
}
.dlg-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--mdf-border, #d0d7de);
}
.dlg-btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid var(--mdf-border, #d0d7de);
  background: var(--mdf-bg, #ffffff);
  color: var(--mdf-fg, #24292f);
  cursor: pointer;
  font: inherit;
}
.dlg-btn:hover {
  background: var(--mdf-hover, #f3f4f6);
}
.dlg-btn.confirm {
  color: #ffffff;
  border-color: transparent;
}
.dlg-btn.confirm.tone-info { background: var(--mdf-accent, #4183c4); }
.dlg-btn.confirm.tone-warn { background: #bf8700; }
.dlg-btn.confirm.tone-danger { background: #cf222e; }
.dlg-btn.confirm:hover { filter: brightness(0.93); }

.dlg-enter-from,
.dlg-leave-to { opacity: 0; }
.dlg-enter-active,
.dlg-leave-active { transition: opacity 0.15s ease; }
</style>