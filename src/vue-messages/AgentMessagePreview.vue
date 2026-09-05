<script setup lang="ts">
import { ChevronRight, X } from "@lucide/vue";
import { computed, ref } from "vue";
import AgentChatMessage from "./AgentChatMessage.vue";
import { AGENT_MESSAGE_PREVIEWS } from "./previews";

defineProps<{ onClose: () => void }>();

const active = ref(AGENT_MESSAGE_PREVIEWS[0].id);
const preview = computed(() => AGENT_MESSAGE_PREVIEWS.find((item) => item.id === active.value) || AGENT_MESSAGE_PREVIEWS[0]);

const contract = computed(() =>
  JSON.stringify(
    {
      role: preview.value.message.role,
      type: preview.value.message.type,
      data: preview.value.message.data ? "{…}" : undefined,
      content: preview.value.message.content ? "string" : undefined,
    },
    null,
    2,
  ),
);
</script>

<template>
  <div class="modal-layer agent-preview-layer" role="dialog" aria-modal="true" aria-label="Agent message type preview">
    <button class="modal-backdrop" type="button" @click="onClose" aria-label="Close message preview" />
    <section class="agent-preview-modal">
      <header>
        <div>
          <span class="panel-kicker">Component gallery</span>
          <h2>Agent message types</h2>
          <p>Preview the isolated renderer and interaction for every supported Agent payload.</p>
        </div>
        <button class="icon-button" type="button" aria-label="Close message preview" title="Close message preview" @click="onClose"><X :size="20" /></button>
      </header>
      <div class="agent-preview-workspace">
        <nav aria-label="Agent message types">
          <button v-for="(item, index) in AGENT_MESSAGE_PREVIEWS" :key="item.id" type="button" :class="{ active: active === item.id }" @click="active = item.id">
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <div><strong>{{ item.label }}</strong><small>{{ item.caption }}</small></div>
            <ChevronRight :size="15" />
          </button>
        </nav>
        <main>
          <div class="agent-preview-heading">
            <div><span>Live preview</span><h3>{{ preview.label }}</h3><p>{{ preview.caption }}</p></div>
            <code>type: {{ preview.id }}</code>
          </div>
          <div class="agent-preview-canvas">
            <AgentChatMessage :item="preview.message" />
          </div>
          <div class="agent-preview-contract">
            <strong>Payload contract</strong>
            <code>{{ contract }}</code>
          </div>
        </main>
      </div>
    </section>
  </div>
</template>

<style scoped>
.agent-preview-canvas :deep(.vue-agent-chat-message) {
  width: min(760px, 100%);
  max-width: 760px;
}
</style>
