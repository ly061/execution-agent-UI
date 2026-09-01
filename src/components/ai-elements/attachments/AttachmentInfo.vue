<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { cn } from "../../../lib/utils";
import { useAttachmentContext } from "./context";
import { getAttachmentLabel } from "./utils";

const props = withDefaults(defineProps<{ showMediaType?: boolean; class?: HTMLAttributes["class"] }>(), { showMediaType: false });
const { data, variant } = useAttachmentContext();
const label = computed(() => getAttachmentLabel(data.value));
</script>

<template><div v-if="variant !== 'grid'" :class="cn('min-w-0 flex-1', props.class)"><span>{{ label }}</span><small v-if="props.showMediaType && data.mediaType">{{ data.mediaType }}</small></div></template>
