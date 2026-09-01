<script setup lang="ts">
import type { AttachmentData } from "../components/ai-elements/attachments";
import { DatabaseIcon, FileTextIcon, PaperclipIcon, SendIcon, SparklesIcon, UploadIcon } from "@lucide/vue";
import { computed, onBeforeUnmount, ref } from "vue";
import { Attachment, AttachmentInfo, AttachmentPreview, AttachmentRemove, Attachments } from "../components/ai-elements/attachments";

const props = defineProps<{
  bridge: { busy: boolean; error: string };
  onSubmit: (payload: { text: string; file: File | null }) => void;
  onLearn: (file: File) => void;
}>();

const text = ref("");
const requirementFile = ref<File | null>(null);
const attachment = ref<AttachmentData | null>(null);
const menuOpen = ref(false);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const learnInput = ref<HTMLInputElement | null>(null);
const canSubmit = computed(() => !props.bridge.busy && (!!text.value.trim() || !!requirementFile.value));

function clearAttachment() {
  if (attachment.value?.type === "file" && attachment.value.url?.startsWith("blob:")) URL.revokeObjectURL(attachment.value.url);
  requirementFile.value = null;
  attachment.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

function attach(file?: File) {
  if (!file || !/\.(pdf|docx|md|txt)$/i.test(file.name)) return;
  clearAttachment();
  requirementFile.value = file;
  attachment.value = { id: crypto.randomUUID(), type: "file", filename: file.name, mediaType: file.type || "application/octet-stream", url: URL.createObjectURL(file) };
  menuOpen.value = false;
}

function submit() {
  if (!canSubmit.value) return;
  props.onSubmit({ text: text.value.trim(), file: requirementFile.value });
}

function learn(file?: File) {
  if (!file) return;
  menuOpen.value = false;
  props.onLearn(file);
  if (learnInput.value) learnInput.value.value = "";
}

function drop(event: DragEvent) {
  event.preventDefault();
  dragging.value = false;
  attach(event.dataTransfer?.files?.[0]);
}

onBeforeUnmount(clearAttachment);
</script>

<template>
  <section class="vue-agent-entry">
    <header class="welcome">
      <span class="mark"><SparklesIcon /></span>
      <p class="kicker">QA Orbit · Vue Agent</p>
      <h2>What would you like to test?</h2>
      <p>Describe the feature, paste a requirement, or attach a document. The agent will ask only for details that change the suite.</p>
    </header>

    <form class="prompt" :class="{ dragging }" @submit.prevent="submit" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop="drop">
      <Attachments v-if="attachment" variant="inline" class="attachment-list">
        <Attachment :data="attachment" class="requirement-attachment" @remove="clearAttachment">
          <AttachmentPreview class="attachment-preview" />
          <AttachmentInfo class="attachment-info" />
          <AttachmentRemove class="attachment-remove" :label="`Remove ${requirementFile?.name || 'attachment'}`" />
        </Attachment>
      </Attachments>

      <textarea v-model="text" :disabled="bridge.busy" rows="4" autofocus placeholder="Describe a feature or paste your requirements…" aria-label="Describe what you want to test" @keydown.enter.exact.prevent="submit" />

      <footer>
        <div class="tools">
          <div class="attachment-menu">
            <button type="button" :disabled="bridge.busy" :aria-expanded="menuOpen" aria-haspopup="menu" @click="menuOpen = !menuOpen"><PaperclipIcon /><span>Attach</span></button>
            <div v-if="menuOpen" class="menu" role="menu" aria-label="Attachment options">
              <button type="button" role="menuitem" @click="fileInput?.click()"><span><FileTextIcon /></span><div><strong>Upload requirement</strong><small>PDF, DOCX, Markdown or TXT</small></div></button>
              <button type="button" role="menuitem" @click="learnInput?.click()"><span><DatabaseIcon /></span><div><strong>Learn cases</strong><small>Approved XLSX, XLS or CSV</small></div></button>
            </div>
          </div>
          <span v-if="attachment" class="attachment-status"><UploadIcon /> Ready to send</span>
        </div>
        <div class="send">
          <span v-if="text">{{ text.length.toLocaleString() }}</span>
          <button type="submit" :disabled="!canSubmit" aria-label="Send requirements"><span v-if="bridge.busy" class="spinner" /><SendIcon v-else /></button>
        </div>
      </footer>

      <input ref="fileInput" type="file" accept=".pdf,.docx,.md,.txt" hidden @change="attach(($event.target as HTMLInputElement).files?.[0])">
      <input ref="learnInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="learn(($event.target as HTMLInputElement).files?.[0])">
    </form>

    <div class="suggestions" aria-label="Example prompts">
      <button type="button" @click="text = 'Generate login test cases covering valid credentials, invalid passwords, account lockout, and session expiry.'">Test a login flow</button>
      <button type="button" @click="text = 'Create API test cases for creating, updating, and cancelling an order, including validation and permission errors.'">Cover an API</button>
      <button type="button" @click="text = 'Review this requirement for missing edge cases and then generate a complete regression suite.'">Build a regression suite</button>
    </div>

    <p v-if="bridge.error" class="error">{{ bridge.error }}</p>
    <p class="footnote">QA Orbit can make mistakes. Review generated cases before adding them to your project.</p>
  </section>
</template>

<style scoped>
.vue-agent-entry{width:min(820px,100%);min-height:calc(100vh - 280px);margin:0 auto;padding:clamp(42px,8vh,92px) 0 28px;display:flex;flex-direction:column;align-items:center;color:#243246}.welcome{width:min(660px,100%);margin-bottom:28px;text-align:center}.mark{width:52px;height:52px;margin:0 auto 14px;display:grid;place-items:center;border:1px solid #f2c8d4;border-radius:15px;color:#d31145;background:#fff;box-shadow:0 8px 26px rgba(211,17,69,.1)}.mark svg{width:25px}.kicker{margin:0 0 7px!important;color:#d31145!important;font-size:9px!important;font-weight:750;letter-spacing:.09em;text-transform:uppercase}.welcome h2{margin:0;font-family:Manrope,sans-serif;font-size:clamp(25px,3vw,34px);letter-spacing:-.045em}.welcome>p:last-child{max-width:590px;margin:10px auto 0;color:#667085;font-size:12px;line-height:1.65}.prompt{width:100%;padding:8px 9px 9px;border:1px solid #dfe3ea;border-radius:22px;background:#fff;box-shadow:0 10px 34px rgba(26,36,58,.09),0 1px 2px rgba(26,36,58,.04);transition:.16s ease}.prompt:focus-within{border-color:#e6a5b8;box-shadow:0 12px 40px rgba(26,36,58,.11),0 0 0 3px rgba(211,17,69,.06)}.prompt.dragging{border-color:#d31145;background:#fff9fb;transform:translateY(-2px)}textarea{width:100%;min-height:104px;max-height:260px;padding:15px 16px 8px;border:0;outline:0;resize:none;color:#243246;background:transparent;font:inherit;font-size:14px;line-height:1.6}textarea::placeholder{color:#9aa4b2}footer{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px}.tools,.send{display:flex;align-items:center;gap:8px}button{font:inherit}.attachment-menu{position:relative}.attachment-menu>button{min-height:36px;padding:0 11px;display:inline-flex;align-items:center;gap:7px;border:0;border-radius:10px;color:#667085;background:transparent;font-size:10.5px;font-weight:650;cursor:pointer}.attachment-menu>button svg{width:17px}.attachment-menu>button:hover,.attachment-menu>button[aria-expanded=true]{color:#d31145;background:#fff0f4}.menu{position:absolute;left:0;bottom:calc(100% + 9px);z-index:12;width:268px;padding:6px;border:1px solid #e2e6ec;border-radius:14px;background:#fff;box-shadow:0 16px 38px rgba(26,36,58,.16)}.menu>button{width:100%;min-height:58px;padding:8px 9px;display:grid;grid-template-columns:36px 1fr;gap:9px;align-items:center;border:0;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.menu>button:hover{background:#fff7f9}.menu>button>span{width:36px;height:36px;display:grid;place-items:center;border-radius:9px;color:#d31145;background:#fff0f4}.menu svg{width:18px}.menu strong,.menu small{display:block}.menu strong{font-size:10.5px}.menu small{margin-top:3px;color:#98a2b3;font-size:9px}.attachment-status{display:flex;align-items:center;gap:5px;color:#667085;font-size:9px}.attachment-status svg{width:13px}.send>span{color:#98a2b3;font-size:9.5px}.send>button{width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:11px;color:#fff;background:#d31145;box-shadow:0 5px 14px rgba(211,17,69,.24);cursor:pointer}.send>button:disabled{color:#aeb7c6;background:#eef0f4;box-shadow:none;cursor:default}.send svg{width:18px}.spinner{width:15px;height:15px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}.attachment-list{padding:8px 10px 0}.requirement-attachment{max-width:min(370px,100%);display:flex!important;align-items:center!important;gap:7px!important;border-color:#e1e5eb!important;background:#f8f9fb!important}.attachment-preview{width:22px!important;height:22px!important;color:#d31145;background:#fff}.attachment-preview :deep(svg){width:13px}.attachment-info{min-width:0;overflow:hidden}.attachment-info :deep(span){display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;font-weight:700}.attachment-remove{width:21px;height:21px;padding:0;display:grid;place-items:center;border:0;border-radius:6px;color:#98a2b3;background:transparent;opacity:0;cursor:pointer}.requirement-attachment:hover .attachment-remove,.attachment-remove:focus{opacity:1}.attachment-remove :deep(svg){width:11px}.suggestions{width:100%;margin-top:13px;display:flex;justify-content:center;gap:7px;flex-wrap:wrap}.suggestions button{min-height:31px;padding:0 11px;border:1px solid #e1e5eb;border-radius:99px;color:#667085;background:rgba(255,255,255,.76);font-size:9.5px;cursor:pointer}.suggestions button:hover{border-color:#efbfd0;color:#d31145;background:#fff}.error{width:100%;margin:16px 0 0;padding:10px 12px;border:1px solid #f1b7c2;border-radius:10px;color:#b63e57;background:#fff3f5;font-size:10px}.footnote{margin:auto 0 0;padding-top:26px;color:#98a2b3;font-size:9.5px;text-align:center}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:720px){.vue-agent-entry{min-height:0;padding-top:26px}.welcome{margin-bottom:22px}.prompt{border-radius:18px}textarea{min-height:120px;padding-inline:11px}.suggestions{justify-content:flex-start}.attachment-status{display:none}}
</style>
