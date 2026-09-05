<script setup lang="ts">
import { ArrowRight, Rows } from "@lucide/vue";
import { computed } from "vue";

interface Swimlane {
  name: string;
  steps?: string[];
}

const props = defineProps<{
  title?: string;
  lanes?: Swimlane[];
}>();

const maxSteps = computed(() => Math.max(0, ...(props.lanes || []).map((lane) => lane.steps?.length || 0)));
</script>

<template>
  <section class="agent-visual-card">
    <header><Rows :size="17" /><div><strong>{{ title }}</strong><small>Swimlane</small></div></header>
    <div class="agent-swimlane" :style="{ '--lane-steps': maxSteps }">
      <div v-for="lane in lanes || []" :key="lane.name" class="agent-swimlane-row">
        <strong>{{ lane.name }}</strong>
        <div>
          <span v-for="(step, index) in lane.steps || []" :key="index">{{ step }}<ArrowRight v-if="index < (lane.steps?.length || 0) - 1" :size="12" /></span>
        </div>
      </div>
    </div>
  </section>
</template>
