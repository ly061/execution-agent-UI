<script setup lang="ts">
import { ArrowRight, Check, Sparkles } from "@lucide/vue";
import { ElButton } from "element-plus";
import { ref } from "vue";

interface ActionItem {
  label: string;
  description?: string;
  cta?: string;
}

defineProps<{
  title: string;
  detail?: string;
  actions?: ActionItem[];
}>();

const resolved = ref<number[]>([]);
</script>

<template>
  <section class="agent-action-card">
    <header><span><Sparkles :size="17" /></span><div><small>Suggested actions</small><strong>{{ title }}</strong></div></header>
    <p v-if="detail">{{ detail }}</p>
    <div class="agent-action-list">
      <article v-for="(action, index) in actions || []" :key="`${action.label}-${index}`" :class="{ resolved: resolved.includes(index) }">
        <span><strong>{{ action.label }}</strong><small>{{ action.description }}</small></span>
        <em v-if="resolved.includes(index)"><Check :size="13" /> Applied</em>
        <el-button v-else size="small" link class="agent-action-apply" @click="resolved.push(index)">{{ action.cta || "Apply" }}<ArrowRight :size="13" /></el-button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.agent-action-list :deep(.el-button.agent-action-apply) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  border: 0;
  color: var(--pink, #d31145);
  background: transparent;
  font-size: 8.5px;
  font-weight: 750;
  padding: 0;
  height: auto;
}
.agent-action-list :deep(.el-button.agent-action-apply:hover),
.agent-action-list :deep(.el-button.agent-action-apply:focus) {
  color: var(--pink, #d31145);
  background: transparent;
}
</style>
