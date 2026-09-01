<script setup lang="ts">
import type { HTMLAttributes, VNode } from "vue";
import type { AttachmentMediaCategory } from "./types";
import { FileTextIcon, GlobeIcon, ImageIcon, Music2Icon, PaperclipIcon, VideoIcon } from "@lucide/vue";
import { computed } from "vue";
import { cn } from "../../../lib/utils";
import { useAttachmentContext } from "./context";

const props = defineProps<{ fallbackIcon?: VNode; class?: HTMLAttributes["class"] }>();
const { data, mediaCategory, variant } = useAttachmentContext();
const isGrid = computed(() => variant.value === "grid");
const fileUrl = computed(() => data.value.type === "file" ? data.value.url : undefined);
const showImage = computed(() => mediaCategory.value === "image" && !!fileUrl.value);
const showVideo = computed(() => mediaCategory.value === "video" && !!fileUrl.value);
const icons: Record<AttachmentMediaCategory, typeof ImageIcon> = { image: ImageIcon, video: VideoIcon, audio: Music2Icon, source: GlobeIcon, document: FileTextIcon, unknown: PaperclipIcon };
const icon = computed(() => icons[mediaCategory.value]);
</script>

<template>
  <div :class="cn('flex shrink-0 items-center justify-center overflow-hidden', variant === 'grid' && 'size-full bg-muted', variant === 'inline' && 'size-5 rounded bg-background', variant === 'list' && 'size-12 rounded bg-muted', props.class)">
    <img v-if="showImage" :alt="data.type === 'file' ? data.filename : 'Image'" :src="fileUrl" :width="isGrid ? 96 : 20" :height="isGrid ? 96 : 20">
    <video v-else-if="showVideo" muted :src="fileUrl" />
    <component :is="props.fallbackIcon" v-else-if="props.fallbackIcon" />
    <component :is="icon" v-else />
  </div>
</template>
