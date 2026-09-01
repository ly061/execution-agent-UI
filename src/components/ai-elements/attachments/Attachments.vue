<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { AttachmentVariant } from "./types";
import { computed, provide } from "vue";
import { cn } from "../../../lib/utils";
import { AttachmentsKey } from "./context";

const props = withDefaults(defineProps<{ variant?: AttachmentVariant; class?: HTMLAttributes["class"] }>(), { variant: "grid" });
const variant = computed(() => props.variant);
provide(AttachmentsKey, { variant });
</script>

<template>
  <div :class="cn('flex items-start', variant === 'list' ? 'flex-col gap-2' : 'flex-wrap gap-2', variant === 'grid' && 'ml-auto w-fit', props.class)" v-bind="$attrs"><slot /></div>
</template>
