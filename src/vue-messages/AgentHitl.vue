<script setup lang="ts">
import { CheckCircle2, ShieldCheck, X } from "@lucide/vue";
import { ElButton, ElInput } from "element-plus";
import { ref } from "vue";

defineProps<{
  title: string;
  description?: string;
  risk?: string;
}>();

const emit = defineEmits<{
  (e: "decision", decision: "approved" | "rejected", comment: string): void;
}>();

const comment = ref("");
const decision = ref<"" | "approved" | "rejected">("");

function decide(next: "approved" | "rejected") {
  decision.value = next;
  emit("decision", next, comment.value);
}
</script>

<template>
  <section class="agent-hitl" :class="{ decided: !!decision }">
    <header>
      <span><ShieldCheck :size="18" /></span>
      <div><small>Human approval required</small><strong>{{ title }}</strong></div>
      <em v-if="risk">{{ risk }}</em>
    </header>
    <p>{{ description }}</p>
    <div v-if="decision" class="agent-decision" :class="decision">
      <CheckCircle2 v-if="decision === 'approved'" :size="16" />
      <X v-else :size="16" />
      <span>{{ decision === "approved" ? "Approved" : "Rejected" }}{{ comment ? ` · ${comment}` : "" }}</span>
      <button type="button" @click="decision = ''">Change</button>
    </div>
    <template v-else>
      <label>
        <span>Comment (optional)</span>
        <el-input v-model="comment" type="textarea" :rows="2" resize="vertical" placeholder="Add context for the agent…" />
      </label>
      <div class="agent-card-actions">
        <el-button class="agent-reject" size="small" @click="decide('rejected')"><X :size="14" /> Reject</el-button>
        <el-button class="agent-approve" size="small" @click="decide('approved')"><CheckCircle2 :size="14" /> Approve</el-button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.agent-hitl :deep(.el-textarea__inner) {
  width: 100%;
  padding: 8px 9px;
  border: 1px solid #dfe3e9;
  border-radius: 8px;
  outline: 0;
  color: #344054;
  background: #fff;
  font: inherit;
  font-size: 9.5px;
  line-height: 1.5;
  box-shadow: none;
  transition: none;
}
.agent-hitl :deep(.el-textarea__inner:focus) {
  border-color: #e7a8ba;
  box-shadow: 0 0 0 2px rgba(211, 17, 69, 0.06);
}
.agent-card-actions :deep(.el-button) {
  min-height: 31px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
}
.agent-card-actions :deep(.el-button.agent-reject) {
  border: 1px solid #e1e5eb;
  color: #667085;
  background: #fff;
}
.agent-card-actions :deep(.el-button.agent-approve) {
  border: 1px solid #c92d56;
  color: #fff;
  background: var(--pink, #d31145);
}
.agent-card-actions :deep(.el-button.agent-approve:hover),
.agent-card-actions :deep(.el-button.agent-approve:focus) {
  color: #fff;
  border-color: #c92d56;
  background: #b80e3c;
}
.agent-card-actions :deep(.el-button + .el-button) {
  margin-left: 7px;
}
</style>
