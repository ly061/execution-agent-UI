<script setup lang="ts">
import { Info, SendHorizontal, UserRound } from "@lucide/vue";
import { ElButton, ElInput } from "element-plus";
import { computed, ref } from "vue";

interface QAItem {
  id?: string;
  question: string;
  context?: string;
  placeholder?: string;
  answer?: string;
}

const props = defineProps<{
  title?: string;
  items?: QAItem[];
}>();

const emit = defineEmits<{
  (e: "answer", payload: { index: number; question: string; answer: string; id?: string }): void;
}>();

const answers = ref<string[]>(props.items?.map((item) => item.answer || "") || []);
const submitted = ref<boolean[]>(props.items?.map((item) => Boolean(item.answer)) || []);
const pending = computed(() => submitted.value.filter((value) => !value).length);

function submit(index: number) {
  if (!answers.value[index]?.trim()) return;
  submitted.value[index] = true;
  emit("answer", { index, question: props.items?.[index]?.question || "", answer: answers.value[index].trim(), id: props.items?.[index]?.id });
}
</script>

<template>
  <section class="agent-qa-card">
    <header><Info :size="17" /><div><strong>{{ title }}</strong><small>{{ pending ? `${pending} question${pending === 1 ? "" : "s"} waiting for your answer` : "All questions answered" }}</small></div></header>
    <div class="agent-qa-list">
      <article v-for="(item, index) in items || []" :key="item.id || index" :class="{ answered: submitted[index] }">
        <div class="agent-question">
          <span>Q{{ index + 1 }}</span>
          <div><small>Agent asks</small><strong>{{ item.question }}</strong><p v-if="item.context">{{ item.context }}</p></div>
        </div>
        <div v-if="submitted[index]" class="agent-user-answer">
          <span><UserRound :size="15" /></span>
          <div><small>Your answer</small><p>{{ answers[index] }}</p></div>
          <button type="button" @click="submitted[index] = false">Edit</button>
        </div>
        <div v-else class="agent-answer-composer">
          <label :for="`agent-answer-${index}`">Your answer</label>
          <el-input :id="`agent-answer-${index}`" v-model="answers[index]" type="textarea" :rows="3" :placeholder="item.placeholder || 'Type your answer for the agent…'" />
          <el-button size="small" class="agent-send-answer" :disabled="!answers[index]?.trim()" @click="submit(index)"><SendHorizontal :size="14" /> Send answer</el-button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.agent-answer-composer :deep(.el-textarea__inner) {
  width: 100%;
  padding: 8px 9px;
  border: 1px solid #d9e0e8;
  border-radius: 8px;
  outline: 0;
  color: #3d4b5f;
  background: #fbfcfd;
  font: inherit;
  font-size: 9px;
  line-height: 1.5;
  box-shadow: none;
  transition: none;
}
.agent-answer-composer :deep(.el-textarea__inner:focus) {
  border-color: #5576c9;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(85, 118, 201, 0.1);
}
.agent-answer-composer :deep(.el-button.agent-send-answer) {
  min-height: 28px;
  margin: 7px 0 0 auto;
  padding: 5px 9px;
  display: flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: #4265ba;
  font-size: 8px;
  font-weight: 700;
}
.agent-answer-composer :deep(.el-button.agent-send-answer:hover),
.agent-answer-composer :deep(.el-button.agent-send-answer:focus) {
  color: #fff;
  background: #3657a8;
}
.agent-answer-composer :deep(.el-button.agent-send-answer.is-disabled),
.agent-answer-composer :deep(.el-button.agent-send-answer.is-disabled:hover) {
  color: #a2aaba;
  background: #e7eaf0;
}
</style>
