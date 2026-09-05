<script setup lang="ts">
import { GitBranch } from "@lucide/vue";
import { computed } from "vue";

interface MindMapBranch {
  label: string;
  items?: string[];
}

const props = defineProps<{
  title?: string;
  center?: string;
  branches?: MindMapBranch[];
}>();

const colors = ["#4f6fc7", "#d45578", "#168576", "#8a63c7", "#d17935", "#3683ad"];
const columns = computed(() => Math.ceil((props.branches?.length || 0) / 2));

function branchStyle(index: number) {
  const column = Math.floor(index / 2);
  return {
    "--branch-color": colors[index % colors.length],
    "--branch-position": `${((column + 0.55) / Math.max(columns.value, 1)) * 100}%`,
  } as Record<string, string>;
}
</script>

<template>
  <section class="agent-visual-card">
    <header><GitBranch :size="17" /><div><strong>{{ title }}</strong><small>Fishbone mind map</small></div></header>
    <div class="agent-mindmap">
      <div class="agent-mindmap-center">{{ center }}</div>
      <div class="agent-mindmap-spine">
        <div class="agent-mindmap-branches">
          <article
            v-for="(branch, index) in branches || []"
            :key="`${branch.label}-${index}`"
            :class="index % 2 ? 'lower' : 'upper'"
            :style="branchStyle(index)"
          >
            <div>
              <strong>{{ branch.label }}</strong>
              <span v-for="item in branch.items || []" :key="item">{{ item }}</span>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
