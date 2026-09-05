<script setup lang="ts">
import { ArrowRight, Waypoints } from "@lucide/vue";
import { computed } from "vue";
import type { FlowchartData, FlowchartEdge, FlowchartNode } from "./types";

const props = defineProps<{ flowchart?: FlowchartData }>();

const nodes = computed<FlowchartNode[]>(() => props.flowchart?.nodes || []);
const edges = computed<FlowchartEdge[]>(() =>
  props.flowchart?.edges?.length
    ? props.flowchart.edges
    : (props.flowchart?.nodes || []).flatMap((node) => (node.next || []).map((target) => ({ from: node.id, to: target }))),
);

const kindLabel: Record<string, string> = { start: "Start", step: "Step", decision: "Decision", end: "Outcome" };

const stages = computed<FlowchartNode[][]>(() => {
  const levels = new Map<string, number>();
  const pending = [...nodes.value];
  nodes.value.forEach((node) => {
    if (Number.isInteger(node.stage)) levels.set(node.id, node.stage as number);
  });
  let passes = 0;
  while (pending.length) {
    const node = pending.shift() as FlowchartNode;
    if (levels.has(node.id)) continue;
    const parents = edges.value.filter((edge) => edge.to === node.id).map((edge) => edge.from);
    if (!parents.length) levels.set(node.id, 0);
    else if (parents.every((id) => levels.has(id))) levels.set(node.id, Math.max(...parents.map((id) => levels.get(id) || 0)) + 1);
    else if (passes > nodes.value.length * nodes.value.length) levels.set(node.id, 0);
    else {
      pending.push(node);
      passes += 1;
      continue;
    }
    passes += 1;
  }
  const stageCount = Math.max(...levels.values()) + 1;
  return Array.from({ length: stageCount }, (_, stage) => nodes.value.filter((node) => levels.get(node.id) === stage));
});
</script>

<template>
  <section v-if="nodes.length" class="gen-requirement-flow" :aria-label="flowchart?.title || 'Requirement flow'">
    <header>
      <Waypoints :size="16" />
      <div><strong>{{ flowchart?.title || "Requirement flow" }}</strong><small>{{ nodes.length }} steps · {{ edges.length }} paths</small></div>
    </header>
    <div class="gen-flow-track" :style="{ '--flow-stages': stages.length }">
      <div v-for="(stage, stageIndex) in stages" :key="stageIndex" class="gen-flow-stage-wrap">
        <div class="gen-flow-stage">
          <article v-for="node in stage" :key="node.id" class="gen-flow-node" :class="node.kind || 'step'">
            <div class="gen-flow-node-label"><i /><small>{{ kindLabel[node.kind] || "Step" }}</small></div>
            <p>{{ node.label }}</p>
            <div v-if="edges.some((edge) => edge.from === node.id && edge.label)" class="gen-flow-edge-labels">
              <span v-for="edge in edges.filter((edge) => edge.from === node.id && edge.label)" :key="`${edge.to}-${edge.label}`">{{ edge.label }}</span>
            </div>
          </article>
        </div>
        <span v-if="stageIndex < stages.length - 1" class="gen-flow-connector" aria-hidden="true"><ArrowRight :size="16" /></span>
      </div>
    </div>
  </section>
</template>
