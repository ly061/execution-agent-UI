<script setup lang="ts">
import { Plus, Rows, Trash2 } from "@lucide/vue";
import { ElButton } from "element-plus";
import { ref } from "vue";
import type { AgentTableColumn, AgentTableRow } from "./types";

const props = defineProps<{
  title?: string;
  columns?: AgentTableColumn[];
  rows?: AgentTableRow[];
}>();

const emit = defineEmits<{
  (e: "change", payload: { columns: AgentTableColumn[]; rows: AgentTableRow[] }): void;
}>();

const draftColumns = ref<AgentTableColumn[]>(props.columns?.map((column, index) => ({ ...column, key: column.key || `column_${index + 1}` })) || []);
const draftRows = ref<AgentTableRow[]>(props.rows?.map((row) => ({ ...row })) || []);

function publish() {
  emit("change", { columns: draftColumns.value, rows: draftRows.value });
}

function changeCell(rowIndex: number, key: string, value: string) {
  draftRows.value[rowIndex][key] = value;
  publish();
}

function changeColumn(columnIndex: number, label: string) {
  draftColumns.value[columnIndex].label = label;
  publish();
}

function addRow() {
  draftRows.value.push(Object.fromEntries(draftColumns.value.map((column) => [column.key, ""])));
  publish();
}

function removeRow(rowIndex: number) {
  draftRows.value.splice(rowIndex, 1);
  publish();
}

function addColumn() {
  const key = `column_${crypto.randomUUID().slice(0, 8)}`;
  draftColumns.value.push({ key, label: `Column ${draftColumns.value.length + 1}` });
  draftRows.value.forEach((row) => {
    row[key] = "";
  });
  publish();
}

function pasteCells(event: ClipboardEvent, rowIndex: number, columnIndex: number) {
  const matrix = (event.clipboardData?.getData("text") || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line, index, list) => line || index < list.length - 1)
    .map((line) => line.split("\t"));
  if (matrix.length === 1 && matrix[0].length === 1) return;
  event.preventDefault();
  const requiredRows = rowIndex + matrix.length;
  while (draftRows.value.length < requiredRows) {
    draftRows.value.push(Object.fromEntries(draftColumns.value.map((column) => [column.key, ""])));
  }
  matrix.forEach((values, pastedRowIndex) =>
    values.forEach((value, pastedColumnIndex) => {
      const column = draftColumns.value[columnIndex + pastedColumnIndex];
      if (column?.key) draftRows.value[rowIndex + pastedRowIndex][column.key] = value;
    }),
  );
  publish();
}
</script>

<template>
  <section class="agent-data-card editable">
    <header><Rows :size="17" /><div><strong>{{ title }}</strong><small>{{ draftRows.length }} rows · click any cell to edit</small></div><span class="agent-table-badge">Editable</span></header>
    <div class="agent-data-table">
      <table>
        <thead>
          <tr>
            <th class="agent-row-number">#</th>
            <th v-for="(column, columnIndex) in draftColumns" :key="column.key">
              <input :aria-label="`Column ${columnIndex + 1} name`" :value="column.label" @input="changeColumn(columnIndex, ($event.target as HTMLInputElement).value)">
            </th>
            <th class="agent-row-action" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in draftRows" :key="rowIndex">
            <th class="agent-row-number">{{ rowIndex + 1 }}</th>
            <td v-for="(column, columnIndex) in draftColumns" :key="column.key">
              <input
                :aria-label="`Row ${rowIndex + 1}, ${column.label}`"
                :value="row[column.key ?? ''] ?? ''"
                @input="changeCell(rowIndex, column.key as string, ($event.target as HTMLInputElement).value)"
                @paste="pasteCells($event, rowIndex, columnIndex)"
              >
            </td>
            <td class="agent-row-action"><button :aria-label="`Delete row ${rowIndex + 1}`" type="button" @click="removeRow(rowIndex)"><Trash2 :size="13" /></button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="agent-table-actions">
      <el-button size="small" class="agent-table-action" @click="addRow"><Plus :size="13" /> Add row</el-button>
      <el-button size="small" class="agent-table-action" @click="addColumn"><Plus :size="13" /> Add column</el-button>
      <small>Paste rows and columns directly from Excel</small>
    </footer>
  </section>
</template>

<style scoped>
.agent-table-actions :deep(.el-button.agent-table-action) {
  min-height: 27px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #e1e5eb;
  border-radius: 7px;
  color: #667085;
  background: #fff;
  font-size: 8.5px;
  font-weight: 700;
}
.agent-table-actions :deep(.el-button.agent-table-action:hover),
.agent-table-actions :deep(.el-button.agent-table-action:focus) {
  color: var(--pink, #d31145);
  border-color: #f0cdd8;
  background: #fff5f8;
}
</style>
