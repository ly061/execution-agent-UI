async function serverRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.error || `Server returned ${response.status}`);
  return payload;
}

export function createServerRun(run) {
  return serverRequest("/api/runs", { method: "POST", body: JSON.stringify(run) });
}

export function listServerRunPlans() {
  return serverRequest("/api/run-plans");
}
