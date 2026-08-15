let config;
let selectedTaskId = null;
let tasks = [];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  setTimeout(() => node.classList.remove("visible"), 2400);
}

async function api(path, options = {}) {
  const response = await fetch(`${config.endpoint}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}`, ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
  return response.json();
}

function renderTasks() {
  const list = $("#task-list");
  if (!tasks.length) {
    list.innerHTML = '<div class="empty compact"><span>◇</span><strong>No runs yet</strong><small>Start a BrowserUse task above.</small></div>';
    return;
  }
  list.innerHTML = tasks.map((task) => `<button class="task-row ${task.id === selectedTaskId ? "selected" : ""}" data-task-id="${task.id}"><span class="task-state ${task.status}"></span><span><strong>${escapeHtml(task.title || task.prompt)}</strong><small>${escapeHtml(task.id.slice(0, 8))} · ${escapeHtml(task.status)}</small></span><time>${escapeHtml(task.updated_at.slice(11, 19))}</time></button>`).join("");
  list.querySelectorAll("[data-task-id]").forEach((button) => button.addEventListener("click", () => {
    selectedTaskId = button.dataset.taskId;
    renderTasks();
    renderDetail();
  }));
}

function renderDetail() {
  const task = tasks.find((item) => item.id === selectedTaskId);
  if (!task) return;
  const cancellable = ["queued", "running"].includes(task.status);
  $("#detail-card").innerHTML = `<div class="section-heading"><div><span class="eyebrow">${escapeHtml(task.id.slice(0, 8))}</span><h2>${escapeHtml(task.title || "Browser task")}</h2></div><span class="badge ${task.status}">${escapeHtml(task.status)}</span></div><p class="task-prompt">${escapeHtml(task.prompt)}</p><div class="meta"><span>Profile <strong>Isolated per run</strong></span><span>Browser <strong>${task.headless ? "Headless" : "Visible"}</strong></span></div><pre>${escapeHtml((task.logs || []).join("\n") || "Waiting for runtime…")}</pre><div class="detail-actions">${task.workspace ? '<button id="open-workspace" class="secondary">Open workspace</button>' : ""}${cancellable ? '<button id="cancel-task" class="danger">Cancel run</button>' : ""}</div>`;
  $("#open-workspace")?.addEventListener("click", () => window.qaOrbit.openWorkspace(task.workspace));
  $("#cancel-task")?.addEventListener("click", async () => {
    await api(`/api/tasks/${task.id}/cancel`, { method: "POST", body: "{}" });
    toast("Cancellation requested");
    refresh();
  });
}

async function refresh() {
  try {
    const health = await api("/health");
    $("#connection-text").textContent = "Ready";
    $("#runtime-label").textContent = `Runtime ${health.version}`;
    document.body.classList.add("online");
    tasks = (await api("/api/tasks")).tasks;
    renderTasks();
    renderDetail();
  } catch (error) {
    document.body.classList.remove("online");
    $("#connection-text").textContent = "Offline";
    $("#runtime-label").textContent = error.message;
  }
}

async function startRun() {
  const prompt = $("#task-input").value.trim();
  if (!prompt) return toast("Describe the task first");
  const button = $("#run-button");
  button.disabled = true;
  try {
    const result = await api("/api/tasks", { method: "POST", body: JSON.stringify({
      title: prompt.slice(0, 64), prompt,
      allowed_domains: $("#domains-input").value.split(",").map((item) => item.trim()).filter(Boolean),
      headless: !$("#headed-input").checked,
    }) });
    selectedTaskId = result.task.id;
    $("#task-input").value = "";
    toast("Run queued");
    await refresh();
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item, .view").forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
  $(`#${button.dataset.view}-view`).classList.add("active");
  $("#view-title").textContent = button.dataset.view === "runs" ? "Runs" : "Connection";
}));

$("#run-button").addEventListener("click", startRun);
$("#refresh-button").addEventListener("click", refresh);
$("#copy-token").addEventListener("click", async () => { await window.qaOrbit.copyToken(); toast("Pairing token copied"); });

config = await window.qaOrbit.config();
$("#endpoint").value = config.endpoint;
$("#token").value = config.token;
$("#device-name").textContent = config.platform === "darwin" ? "This Mac" : "This PC";
await refresh();
setInterval(refresh, 1800);
