import * as XLSX from "xlsx";

const FIELD_ALIASES = {
  case_id: ["case id", "caseid", "test case id", "用例id", "用例编号", "编号"],
  case_type: ["case type", "type", "platform", "channel", "用例类型", "类型", "端"],
  description: ["description", "title", "case name", "test case", "scenario", "scenario name", "summary", "用例描述", "描述", "用例名称", "场景"],
  preconditions: ["pre conditions", "preconditions", "pre condition", "prerequisite", "前置条件", "执行前置条件"],
  test_steps: ["test steps", "steps", "step", "actions", "procedure", "测试步骤", "操作步骤", "步骤"],
  test_data: ["test data", "data", "data set", "dataset", "测试数据", "数据集"],
  expected_result: ["expected result", "expected results", "expected", "outcome", "assertion", "预期结果", "期望结果"],
  priority: ["priority", "severity", "importance", "优先级", "重要级别"],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const requestApiKey = (request, env) => request.headers.get("x-deepseek-api-key")?.trim() || env.DEEPSEEK_API_KEY;
const ALLOWED_ORIGINS = new Set(["https://ly061.github.io", "http://localhost:4173", "http://localhost:5173", "http://127.0.0.1:4173", "http://127.0.0.1:5173"]);

function withCors(response, request) {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-DeepSeek-API-Key");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
const normalize = (value) => String(value ?? "").trim().toLowerCase().replaceAll("_", " ").replace(/[\s\-–—/:()]+/g, " ");

function mappingFor(header, used) {
  const normalized = normalize(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (!used.has(field) && aliases.includes(normalized)) return { source_column: header, target_field: field, confidence: 1, reason: "Known field alias" };
  }
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (!used.has(field) && aliases.some((alias) => alias.length >= 4 && (normalized.includes(alias) || alias.includes(normalized)))) {
      return { source_column: header, target_field: field, confidence: 0.82, reason: "Similar field name" };
    }
  }
  return { source_column: header, target_field: null, confidence: 1, reason: "Preserved as an extra field" };
}

function headerScore(row) {
  return row.reduce((score, value) => score + (Object.values(FIELD_ALIASES).some((aliases) => aliases.includes(normalize(value))) ? 4 : 0), 0) + Math.min(row.filter(Boolean).length, 8) * 0.25;
}

function parseWorkbook(filename, bytes) {
  const workbook = XLSX.read(bytes, { type: "array" });
  const cases = [];
  const sheets = [];
  let generated = 1;
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const candidates = rows.slice(0, 25).map((row, index) => [index, headerScore(row)]).sort((a, b) => b[1] - a[1]);
    if (!candidates.length || candidates[0][1] < 1) {
      sheets.push({ name: sheetName, status: "skipped", reason: "No tabular test case data detected", header_row: null, row_count: 0, mappings: [] });
      continue;
    }
    const headerIndex = candidates[0][0];
    const seen = new Map();
    const headers = rows[headerIndex].map((value, index) => {
      const base = String(value || `Column ${index + 1}`).trim();
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      return count > 1 ? `${base} (${count})` : base;
    });
    const used = new Set();
    const mappings = headers.map((header) => {
      const mapping = mappingFor(header, used);
      if (mapping.target_field) used.add(mapping.target_field);
      return mapping;
    });
    const targetBySource = Object.fromEntries(mappings.map((item) => [item.source_column, item.target_field]));
    let rowCount = 0;
    rows.slice(headerIndex + 1).forEach((row, offset) => {
      if (!row.some((value) => String(value).trim())) return;
      const standard = {};
      const extra_fields = {};
      headers.forEach((header, index) => {
        const value = row[index];
        if (value === "" || value == null) return;
        const target = targetBySource[header];
        if (target) standard[target] = value;
        else extra_fields[header] = value;
      });
      if (!["description", "test_steps", "expected_result"].some((field) => String(standard[field] || "").trim())) return;
      const rawId = String(standard.case_id || "").trim();
      cases.push({
        id: null,
        case_id: rawId || `IMP-${String(generated++).padStart(4, "0")}`,
        case_type: /api|接口/i.test(standard.case_type || "") ? "API" : /mobile|app|移动/i.test(standard.case_type || "") ? "Mobile" : "Web",
        description: String(standard.description || "").trim(), preconditions: String(standard.preconditions || "").trim(),
        test_steps: String(standard.test_steps || "").trim(), test_data: String(standard.test_data || "").trim(),
        expected_result: String(standard.expected_result || "").trim(), priority: /high|critical|最高/i.test(standard.priority || "") ? "P0" : /low|低/i.test(standard.priority || "") ? "P2" : String(standard.priority || "P1").toUpperCase().match(/^P[0-2]$/)?.[0] || "P1",
        extra_fields, source_file: filename, source_sheet: sheetName, source_row: headerIndex + offset + 2,
        import_order: cases.length + 1, field_provenance: {}, mapping_confidence: 1,
        warnings: rawId ? [] : ["Case ID was generated"],
      });
      rowCount += 1;
    });
    sheets.push({ name: sheetName, status: "imported", reason: "", header_row: headerIndex + 1, row_count: rowCount, mappings });
  }
  return { cases, sheets };
}

async function getSession(db, id) {
  const row = await db.prepare("SELECT payload_json FROM import_sessions WHERE id = ?").bind(id).first();
  return row ? JSON.parse(row.payload_json) : null;
}

async function saveSession(db, session) {
  await db.prepare("INSERT OR REPLACE INTO import_sessions (id, filename, status, payload_json) VALUES (?, ?, ?, ?)")
    .bind(session.import_id, session.filename, session.status || "preview", JSON.stringify(session)).run();
}

function frontend(testCase, index) {
  const numeric = testCase.id || Number(String(testCase.case_id).replace(/\D/g, "")) || 900001 + index;
  return { ...testCase, id: numeric, title: testCase.description || "Imported test case", test_set: "Not assigned", automation: "Manual", status: "Draft", updated_at: "Just now" };
}

async function interpretWithDeepSeek(message, session, request, env) {
  const apiKey = requestApiKey(request, env);
  if (!apiKey) return null;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You edit exactly one imported QA case. Return JSON only with import_order (integer), field (one exact existing standard or extra field name), value (string), and message (short confirmation). Never return or repeat credentials." },
        { role: "user", content: JSON.stringify({ request: message, cases: session.cases.map(({ import_order, case_id, description, case_type, priority, test_data, extra_fields }) => ({ import_order, case_id, description, case_type, priority, test_data, extra_fields })) }) },
      ],
      thinking: { type: "disabled" },
    }),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "DeepSeek rejected this API key." : "DeepSeek could not process this request right now.");
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const decision = JSON.parse(content || "{}");
  const order = Number(decision.import_order);
  const item = session.cases[order - 1];
  const field = String(decision.field || "").trim();
  if (!item || !field || decision.value == null) return null;
  const extra = !(field in item);
  const before = extra ? item.extra_fields[field] : item[field];
  const value = String(decision.value);
  if (extra) item.extra_fields[field] = value; else item[field] = value;
  return { change: { case_id: item.case_id, import_order: order, field, before, after: value, extra }, message: String(decision.message || "").trim() };
}

async function handleApi(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok", framework: "cloudflare-worker", provider: "deepseek", model: env.DEEPSEEK_MODEL || "deepseek-v4-flash", model_configured: String(Boolean(requestApiKey(request, env))) });
  if (request.method === "POST" && url.pathname === "/api/config/validate") {
    const apiKey = requestApiKey(request, env);
    if (!apiKey) return json({ detail: "Enter a DeepSeek API key first." }, 400);
    const response = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) return json({ detail: response.status === 401 ? "DeepSeek rejected this API key." : "DeepSeek could not verify this API key right now." }, response.status === 401 ? 401 : 502);
    return json({ valid: true, provider: "deepseek", model: env.DEEPSEEK_MODEL || "deepseek-v4-flash" });
  }
  const isPreview = request.method === "POST" && url.pathname === "/api/imports/preview";
  const match = url.pathname.match(/^\/api\/imports\/([^/]+)\/(confirm|cases|chat)$/);
  if (!isPreview && !match) return json({ detail: "API route not found" }, 404);
  if (!env.DB) return json({ detail: "The import database is not configured." }, 503);
  if (isPreview) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return json({ detail: "Choose an Excel or CSV file." }, 400);
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) return json({ detail: "Supported files are .xlsx, .xls, .xlsm and .csv" }, 400);
    const import_id = crypto.randomUUID();
    const parsed = parseWorkbook(file.name, new Uint8Array(await file.arrayBuffer()));
    const session = { import_id, filename: file.name, ...parsed, warnings: parsed.cases.length ? [] : ["No test cases were detected. Check the header row and field names."], explanation: [`Read ${parsed.sheets.length} sheet(s).`, "Matched known aliases and preserved unmatched columns.", "Recorded the source sheet and row for every imported case."], status: "preview", history: [] };
    await saveSession(env.DB, session);
    return json(session);
  }
  const session = await getSession(env.DB, match[1]);
  if (!session) return json({ detail: "Import session not found" }, 404);
  if (match[2] === "cases" && request.method === "GET") return json({ import_id: session.import_id, cases: session.cases.map(frontend) });
  if (match[2] === "confirm" && request.method === "POST") {
    session.status = "confirmed";
    await saveSession(env.DB, session);
    const cases = session.cases.map(frontend);
    return json({ import_id: session.import_id, imported_count: cases.length, cases, message: `Imported ${cases.length} reviewed test case(s).` });
  }
  if (match[2] === "chat" && request.method === "POST") {
    const { message = "" } = await request.json();
    const undo = /\bundo\b|撤销|取消上次/i.test(message);
    let change;
    let modelMessage = "";
    if (undo) {
      change = session.history.pop();
      if (!change) return json({ message: "There is no case change to undo.", changes: [], cases: [], can_undo: false });
      const item = session.cases[change.import_order - 1];
      if (change.extra) item.extra_fields[change.field] = change.before; else item[change.field] = change.before;
      [change.before, change.after] = [change.after, change.before];
    } else {
      const orderMatch = message.match(/第\s*([一二三四五六七八九十\d]+)\s*条|case\s*#?\s*(\d+)|row\s*(\d+)/i);
      const rawOrder = orderMatch && orderMatch.slice(1).find(Boolean);
      const chinese = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      const order = rawOrder && (/^\d+$/.test(rawOrder) ? Number(rawOrder) : chinese[rawOrder]);
      const aliases = { "case id": "case_id", 用例编号: "case_id", "case type": "case_type", 类型: "case_type", description: "description", 描述: "description", preconditions: "preconditions", 前置条件: "preconditions", "test steps": "test_steps", 步骤: "test_steps", "test data": "test_data", 测试数据: "test_data", "expected result": "expected_result", 预期结果: "expected_result", priority: "priority", 优先级: "priority", "user name": "User Name", username: "User Name", 用户名: "User Name" };
      const field = Object.entries(aliases).find(([alias]) => message.toLowerCase().includes(alias.toLowerCase()))?.[1];
      const value = message.match(/(?:应该(?:用|是)?|改成|改为|更新为|\buse\b|\bto\b|=)\s*[\"“']?([^\"”'，。,.]+)/i)?.[1]?.trim();
      if (!order || !field || !value || !session.cases[order - 1]) {
        try {
          const interpreted = await interpretWithDeepSeek(message, session, request, env);
          if (!interpreted) return json({ message: requestApiKey(request, env) ? "I could not identify a safe single-case change." : "I could not identify an exact case, field, and value. Add a DeepSeek API key in Project settings for flexible language.", changes: [], cases: [], can_undo: session.history.length > 0 });
          change = interpreted.change;
          modelMessage = interpreted.message;
        } catch (error) {
          return json({ detail: error.message }, error.message.includes("rejected") ? 401 : 502);
        }
      } else {
        const item = session.cases[order - 1];
        const extra = !(field in item);
        const before = extra ? item.extra_fields[field] : item[field];
        if (extra) item.extra_fields[field] = value; else item[field] = value;
        change = { case_id: item.case_id, import_order: order, field, before, after: value, extra };
      }
      session.history.push(change);
    }
    await saveSession(env.DB, session);
    const changed = session.cases[change.import_order - 1];
    return json({ message: undo ? `Undid the last change to case ${change.import_order}.` : modelMessage || `Updated case ${change.import_order} (${change.case_id}). ${change.field}: ${String(change.before ?? "")} → ${String(change.after)}. You can undo this change.`, changes: [change], cases: [frontend(changed, change.import_order - 1)], can_undo: !undo && session.history.length > 0 });
  }
  return json({ detail: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), request);
      return withCors(await handleApi(request, env, url), request);
    }
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) return response;
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
