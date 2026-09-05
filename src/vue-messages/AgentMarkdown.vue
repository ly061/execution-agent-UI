<script setup lang="ts">
import { computed } from "vue";
import type { AgentInlineToken } from "./types";
import AgentInline from "./AgentInline.vue";

const props = defineProps<{ content?: string }>();

type BlockKind = "h3" | "h4" | "list" | "p" | "gap";

interface Block {
  kind: BlockKind;
  tokens: AgentInlineToken[];
}

function inline(value: string): AgentInlineToken[] {
  return String(value)
    .split(/(\*\*.*?\*\*|`.*?`)/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) return { kind: "bold", text: part.slice(2, -2) };
      if (part.startsWith("`") && part.endsWith("`")) return { kind: "code", text: part.slice(1, -1) };
      return { kind: "text", text: part };
    });
}

const blocks = computed<Block[]>(() =>
  String(props.content || "")
    .split("\n")
    .map((line) => {
      if (/^###\s+/.test(line)) return { kind: "h4", tokens: inline(line.replace(/^###\s+/, "")) };
      if (/^##?\s+/.test(line)) return { kind: "h3", tokens: inline(line.replace(/^##?\s+/, "")) };
      if (/^[-*]\s+/.test(line)) return { kind: "list", tokens: inline(line.replace(/^[-*]\s+/, "")) };
      return line ? { kind: "p", tokens: inline(line) } : { kind: "gap", tokens: [] };
    }),
);
</script>

<template>
  <div class="agent-markdown">
    <template v-for="(block, index) in blocks" :key="index">
      <h4 v-if="block.kind === 'h4'"><AgentInline :tokens="block.tokens" /></h4>
      <h3 v-else-if="block.kind === 'h3'"><AgentInline :tokens="block.tokens" /></h3>
      <div v-else-if="block.kind === 'list'" class="agent-markdown-list"><span>•</span><p><AgentInline :tokens="block.tokens" /></p></div>
      <p v-else-if="block.kind === 'p'"><AgentInline :tokens="block.tokens" /></p>
      <span v-else class="agent-markdown-gap" />
    </template>
  </div>
</template>
