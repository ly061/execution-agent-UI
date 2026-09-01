<script setup lang="ts">
import { XIcon } from "@lucide/vue";
import { useAttachmentContext } from "./context";
const props = withDefaults(defineProps<{ label?: string; class?: string }>(), { label: "Remove" });
const { remove } = useAttachmentContext();
function handleClick(event: Event) { event.stopPropagation(); remove?.(); }
</script>

<template><button type="button" :class="props.class" :aria-label="props.label" @click="handleClick"><slot><XIcon /></slot><span class="sr-only">{{ props.label }}</span></button></template>
