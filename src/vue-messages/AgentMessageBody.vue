<script setup lang="ts">
import { computed } from "vue";
import type { AgentMessage } from "./types";
import AgentMarkdown from "./AgentMarkdown.vue";
import AgentHitl from "./AgentHitl.vue";
import AgentActions from "./AgentActions.vue";
import AgentTable from "./AgentTable.vue";
import AgentQA from "./AgentQA.vue";
import AgentMindMap from "./AgentMindMap.vue";
import AgentSwimlane from "./AgentSwimlane.vue";
import AgentFlowchart from "./AgentFlowchart.vue";

const props = defineProps<{ message: AgentMessage }>();

const type = computed(() => props.message.type || "markdown");
</script>

<template>
  <div v-if="Array.isArray(message.blocks)" class="agent-message-blocks">
    <AgentMessageBody v-for="(block, index) in message.blocks" :key="`${block.type || 'markdown'}-${index}`" :message="block" />
  </div>
  <AgentHitl v-else-if="type === 'hitl'" v-bind="(message.data || {}) as any" />
  <AgentActions v-else-if="type === 'actions'" v-bind="(message.data || {}) as any" />
  <AgentTable v-else-if="type === 'table'" v-bind="(message.data || {}) as any" />
  <AgentQA v-else-if="type === 'qa'" v-bind="(message.data || {}) as any" />
  <AgentMindMap v-else-if="type === 'mindmap'" v-bind="(message.data || {}) as any" />
  <AgentSwimlane v-else-if="type === 'swimlane'" v-bind="(message.data || {}) as any" />
  <AgentFlowchart v-else-if="type === 'flowchart'" :flowchart="(message.data as any)" />
  <AgentMarkdown v-else :content="message.content" />
</template>
