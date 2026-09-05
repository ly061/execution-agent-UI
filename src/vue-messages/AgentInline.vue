<script setup lang="ts">
import type { AgentInlineToken } from "./types";

defineProps<{ tokens: AgentInlineToken[] }>();
</script>

<template>
  <template v-for="(token, ti) in tokens" :key="ti">
    <strong v-if="token.kind === 'bold'">{{ token.text }}</strong>
    <code v-else-if="token.kind === 'code'">{{ token.text }}</code>
    <span v-else>{{ token.text }}</span>
  </template>
</template>
