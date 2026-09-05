<script setup lang="ts">
import { Bot, UserRound } from "@lucide/vue";
import { computed } from "vue";
import { Bubble, Thinking } from "vue-element-plus-x";
import type { AgentMessage } from "./types";
import AgentMessageBody from "./AgentMessageBody.vue";
import AgentFlowchart from "./AgentFlowchart.vue";

const props = defineProps<{ item: AgentMessage }>();

const isAgent = computed(() => props.item.role === "agent");
const bubbleStyle = computed(() =>
  isAgent.value
    ? { "--elx-bubble-bg": "#ffffff", "--elx-bubble-border-color": "#e3e7ee" }
    : { "--elx-bubble-bg": "#fff5f7", "--elx-bubble-border-color": "#f1c5d0" },
);
</script>

<template>
  <Bubble
    class="vue-agent-chat-message"
    :placement="isAgent ? 'start' : 'end'"
    variant="borderless"
    shape="corner"
    max-width="620px"
    :avatar-gap="8"
    :style="bubbleStyle"
  >
    <template #avatar>
      <span class="vue-agent-avatar" :class="isAgent ? 'agent' : 'user'">
        <Bot v-if="isAgent" :size="16" />
        <UserRound v-else :size="16" />
      </span>
    </template>
    <template #content>
      <div class="vue-agent-bubble-content">
        <Thinking
          v-if="isAgent && item.reasoning"
          class="vue-agent-thinking"
          :model-value="true"
          :content="item.reasoning"
          status="end"
          max-width="100%"
        >
          <template #label>AI thinking process</template>
        </Thinking>
        <AgentMessageBody :message="item" />
        <AgentFlowchart v-if="isAgent && item.flowchart" :flowchart="item.flowchart" />
      </div>
    </template>
  </Bubble>
</template>

<style scoped>
.vue-agent-chat-message {
  max-width: 100%;
}
.vue-agent-avatar {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  color: #4265ba;
  background: #e8edff;
}
.vue-agent-avatar.user {
  color: #fff;
  background: var(--pink, #d31145);
}
.vue-agent-bubble-content {
  font-size: 11px;
  color: #344054;
  line-height: 1.5;
  min-width: 0;
}
.vue-agent-thinking {
  margin: 0 0 9px;
  font-size: 10px;
}
.vue-agent-thinking :deep(.elx-thinking__trigger) {
  min-height: 30px;
}
.vue-agent-thinking :deep(.elx-thinking__label) {
  font-size: 10px;
  font-weight: 700;
  color: #52618a;
}
.vue-agent-thinking :deep(.elx-thinking__content-wrapper) {
  font-size: 10px;
}
</style>
