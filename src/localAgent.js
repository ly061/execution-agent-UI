const ENDPOINT_KEY = "qa-orbit-local-agent-endpoint";
const TOKEN_KEY = "qa-orbit-local-agent-token";
const DEFAULT_ENDPOINT = "http://127.0.0.1:8765";

export function getLocalAgentSettings() {
  return {
    endpoint: localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT,
    token: localStorage.getItem(TOKEN_KEY) || "",
  };
}

export function saveLocalAgentSettings({ endpoint, token }) {
  localStorage.setItem(ENDPOINT_KEY, endpoint.replace(/\/$/, ""));
  localStorage.setItem(TOKEN_KEY, token.trim());
}

async function request(path, options = {}) {
  const { endpoint, token } = getLocalAgentSettings();
  if (!token) throw new Error("Pair this browser with QA Orbit Agent first.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${endpoint}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Local Agent returned ${response.status}`);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Local Agent did not respond. Make sure the desktop app is open.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkLocalAgent() {
  return request("/health");
}

export async function submitLocalRun(run) {
  return request("/api/tasks", { method: "POST", body: JSON.stringify(run) });
}

export async function listLocalRuns() {
  return request("/api/tasks");
}

export async function cancelLocalRun(taskId) {
  return request(`/api/tasks/${taskId}/cancel`, { method: "POST", body: "{}" });
}
