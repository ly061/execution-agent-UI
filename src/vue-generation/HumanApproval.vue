<script setup lang="ts">
import { CheckIcon, ShieldCheckIcon, XIcon } from "@lucide/vue";

defineProps<{
  title: string;
  description: string;
  onApprove: () => void;
  onReject: () => void;
}>();
</script>

<template>
  <section class="human-approval" aria-live="polite">
    <div class="copy">
      <span class="badge"><ShieldCheckIcon /></span>
      <div>
        <small>Human approval required</small>
        <strong>{{ title }}</strong>
        <p>{{ description }}</p>
      </div>
    </div>
    <div class="actions">
      <button class="reject" type="button" @click="onReject"><XIcon /> Reject</button>
      <button class="approve" type="button" @click="onApprove"><CheckIcon /> Approve &amp; apply</button>
    </div>
  </section>
</template>

<style scoped>
.human-approval{margin:14px 16px 0;padding:13px;display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #e6c9d3;border-radius:11px;background:#fffafb}.copy{min-width:0;display:flex;align-items:flex-start;gap:9px}.badge{width:30px;height:30px;display:grid;place-items:center;flex:0 0 auto;border-radius:8px;color:#d31145;background:#fdebf0}.badge svg{width:18px}.copy small,.copy strong{display:block}.copy small{color:#a05268;font-size:8px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}.copy strong{margin-top:2px;color:#344054;font-size:11px}.copy p{margin:4px 0 0;color:#667085;font-size:10px;line-height:1.45}.actions{display:flex;flex:0 0 auto;gap:7px}button{min-height:32px;padding:0 10px;display:inline-flex;align-items:center;gap:5px;border-radius:8px;font:inherit;font-size:9.5px;font-weight:700;cursor:pointer}button svg{width:15px}.reject{border:1px solid #dfe3ea;color:#667085;background:#fff}.approve{border:1px solid #d31145;color:#fff;background:#d31145}@media(max-width:640px){.human-approval{align-items:flex-start;flex-direction:column}.actions{width:100%;justify-content:flex-end}}
</style>
