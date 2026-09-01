<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { AttachmentData } from "./types";
import { computed, provide } from "vue";
import { cn } from "../../../lib/utils";
import { AttachmentKey, useAttachmentsContext } from "./context";
import { getMediaCategory } from "./utils";

const props = defineProps<{ data: AttachmentData; class?: HTMLAttributes["class"] }>();
const emit = defineEmits<{ (event: "remove"): void }>();
const { variant } = useAttachmentsContext();
const data = computed(() => props.data);
const mediaCategory = computed(() => getMediaCategory(props.data));
provide(AttachmentKey, { data, mediaCategory, remove: () => emit("remove"), variant });
</script>

<template>
  <div :class="cn('group relative', variant === 'grid' && 'size-24 overflow-hidden rounded-lg', variant === 'inline' && ['flex h-8 cursor-pointer select-none items-center gap-1.5', 'rounded-md border border-border px-1.5', 'font-medium text-sm transition-all', 'hover:bg-accent hover:text-accent-foreground'], variant === 'list' && ['flex w-full items-center gap-3 rounded-lg border p-3', 'hover:bg-accent/50'], props.class)" v-bind="$attrs"><slot /></div>
</template>
