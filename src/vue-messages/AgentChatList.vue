<script setup lang="ts">
import { Bot } from "@lucide/vue";
import { Bubble, Thinking } from "vue-element-plus-x";
import type { AgentMessage } from "./types";
import AgentChatMessage from "./AgentChatMessage.vue";

defineProps<{
  bridge: {
    messages: AgentMessage[];
    busy: boolean;
    liveThinking: string;
  };
}>();
</script>

<!-- Multi-root on purpose: bubbles become direct children of the host .chat-messages flex container. -->
<template>
  <AgentChatMessage v-for="(item, index) in bridge.messages" :key="`${item.role}-${index}`" :item="item" />
  <Bubble
    v-if="bridge.busy"
    class="vue-agent-chat-message"
    placement="start"
    variant="borderless"
    shape="corner"
    max-width="620px"
    :avatar-gap="8"
    style="--elx-bubble-bg: #ffffff; --elx-bubble-border-color: #e3e7ee"
  >
    <template #avatar>
      <span class="vue-agent-avatar agent"><Bot :size="16" /></span>
    </template>
    <template #content>
      <div class="vue-agent-bubble-content">
        <Thinking v-if="bridge.liveThinking" class="vue-agent-thinking live" :model-value="true" :content="bridge.liveThinking" status="thinking" max-width="100%">
          <template #label>AI is thinking…</template>
        </Thinking>
        <p v-else class="vue-agent-working">The agent is working…</p>
      </div>
    </template>
  </Bubble>
</template>

<style scoped>
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
.vue-agent-avatar.agent {
  color: #4265ba;
  background: #e8edff;
}
.vue-agent-bubble-content {
  font-size: 11px;
  color: #344054;
  line-height: 1.5;
  min-width: 0;
}
.vue-agent-working {
  margin: 0;
  color: #667085;
}
.vue-agent-thinking {
  margin: 0;
  font-size: 10px;
}
.vue-agent-thinking.live :deep(.elx-thinking__label) {
  color: #4265ba;
}
</style>
