import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, request.url.includes("/api/") ? 0 : 1);
  }
});

test("serves the deployed backend health endpoint", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    framework: "cloudflare-worker",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    model_configured: "false",
  });
});

test("validates a manually supplied API key without persisting it", async () => {
  const originalFetch = globalThis.fetch;
  let authorization;
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return new Response(JSON.stringify({ object: "list" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/config/validate", { method: "POST", headers: { "X-DeepSeek-API-Key": "sk-user-key" } }), {});
    assert.equal(response.status, 200);
    assert.equal(authorization, "Bearer sk-user-key");
    assert.equal((await response.json()).valid, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the project AI service to assist with editing a test case", async () => {
  const originalFetch = globalThis.fetch;
  let authorization;
  let modelRequest;
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    modelRequest = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ message: "Clarified the expected result.", changes: { expected_result: "A claim reference is displayed after successful submission.", case_id: "DO-NOT-CHANGE" } }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/cases/assist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Improve clarity", test_case: { case_id: "TC-1", expected_result: "Created" }, available_data_sets: [] }),
    }), { DEEPSEEK_API_KEY: "sk-project-key" });
    assert.equal(response.status, 200);
    assert.equal(authorization, "Bearer sk-project-key");
    assert.equal(modelRequest.model, "deepseek-v4-flash");
    assert.deepEqual((await response.json()).changes, { expected_result: "A claim reference is displayed after successful submission." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports when the project AI service is not configured", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/cases/assist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Improve clarity", test_case: {}, available_data_sets: [] }),
  }), {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).detail, /not configured/i);
});

test("allows the GitHub Pages frontend to call the API", async () => {
  const request = new Request("https://example.test/api/health", { headers: { Origin: "https://ly061.github.io" } });
  const response = await worker.fetch(request, {});
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://ly061.github.io");

  const preflight = await worker.fetch(new Request("https://example.test/api/imports/preview", {
    method: "OPTIONS",
    headers: { Origin: "https://ly061.github.io", "Access-Control-Request-Headers": "x-deepseek-api-key" },
  }), {});
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /X-DeepSeek-API-Key/);
});

test("imports, edits, undoes, and confirms cases through the deployed API", async () => {
  let payload;
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.startsWith("INSERT")) payload = values[3];
              return {};
            },
            async first() {
              return payload ? { payload_json: payload } : null;
            },
          };
        },
      };
    },
  };
  const workbook = new FormData();
  workbook.set("file", new File(["Case ID,Description,Steps,Expected Result,User Name\nWEB-1,Login,Submit form,Dashboard opens,Joe"], "cases.csv", { type: "text/csv" }));
  const previewResponse = await worker.fetch(new Request("https://example.test/api/imports/preview", { method: "POST", body: workbook }), { DB });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.cases.length, 1);
  assert.equal(preview.cases[0].extra_fields["User Name"], "Joe");

  const chatResponse = await worker.fetch(new Request(`https://example.test/api/imports/${preview.import_id}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "第一条 case 的 user name 改为 Lisa" }) }), { DB });
  assert.equal(chatResponse.status, 200);
  const chat = await chatResponse.json();
  assert.equal(chat.cases[0].extra_fields["User Name"], "Lisa");

  const undoResponse = await worker.fetch(new Request(`https://example.test/api/imports/${preview.import_id}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "撤销" }) }), { DB });
  assert.equal((await undoResponse.json()).cases[0].extra_fields["User Name"], "Joe");

  const confirmResponse = await worker.fetch(new Request(`https://example.test/api/imports/${preview.import_id}/confirm`, { method: "POST" }), { DB });
  const confirmed = await confirmResponse.json();
  assert.equal(confirmed.imported_count, 1);
  assert.equal(confirmed.cases[0].title, "Login");
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
