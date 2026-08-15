# QA Orbit — Execution Agent UI

[![Deploy to GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-d31145?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ly061/execution-agent-UI/actions/workflows/deploy-pages.yml)

Interactive test-management frontend prototype covering Test Plans, Test Sets, Test Cases, Test Data, execution evidence, application configuration, security configuration and project settings.

## Local browser execution agent

The first executable Local Agent MVP lives in [`local-agent/`](local-agent/README.md). It provides a macOS/Windows Electron app backed by a Python BrowserUse runtime, isolated per-run browser profiles and workspaces, launch-scoped pairing tokens, live logs, cancellation, and a localhost-only API. The web run dialog can pair with the desktop app and shows local task state on the Test Runs page.

## LangChain test case agents

The Test cases → Upload cases flow is backed by a Python FastAPI service using LangChain and LangGraph. It reads every Excel sheet, detects header rows, maps similar column names into the standard case schema, preserves unmatched columns, records source provenance, and exposes a conversational correction tool with an audit trail and undo. The Edit test case assistant uses the same backend and project-level DeepSeek configuration to improve the current draft before it is saved.

Set `DEEPSEEK_API_KEY` to enable LangChain semantic mapping and flexible agent language. The service uses DeepSeek's OpenAI-compatible API and defaults to `deepseek-v4-flash`; override it with `DEEPSEEK_MODEL`. Clear aliases and precise corrections continue to work deterministically without a model call.
The integration uses non-thinking mode because LangChain structured output selects a schema tool explicitly, which DeepSeek V4's default thinking mode does not accept.

## Generate cases — interactive AI authoring

The Test cases → Generate cases flow is an interactive clarify-then-generate conversation served by `backend/app/generation_agent.py`:

- Requirements can be **pasted as text** or uploaded as PDF/DOCX/MD/TXT (`POST /api/generation/sessions`).
- When the requirements leave gaps (platform, priority, roles, scope…), the agent replies with up to 3 clarifying questions; you answer them in a chat panel (`POST /api/generation/sessions/{id}/chat`) until it generates.
- **Generation keeps the conversation open.** The results view pairs an editable table with a live agent chat: ask it to explain a case, change fields, add edge coverage, or remove cases — it returns either a plain `reply` or an `update` with the complete revised suite.
- **The AI's thinking process is streamed.** The interactive flow enables DeepSeek thinking mode and streams `reasoning_content` over SSE (`POST /api/generation/sessions/stream` and `/chat/stream`) — you watch the reasoning appear live in a collapsible panel, and each finished turn keeps its reasoning behind a small "AI thinking process" toggle.
- Sessions persist in the SQLite agent database, so a finished session can be resumed (`GET /api/generation/sessions/{id}`).

On the static GitHub Pages preview the same three-stage flow runs fully in the browser with a deterministic local generator (text-only inputs).

## Run locally

```bash
npm install
npm run dev
```

In a second terminal, run the agent API:

```bash
# Python 3.11+
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --reload
```

Open `http://localhost:4173/`.

## One-command local deployment

```bash
./deploy-local.sh
```

This installs locked dependencies, builds the production site and starts it in the background at `http://localhost:4173/`. The committed SQLite mock database is served with the application.
It also installs and starts the LangChain import API at `http://127.0.0.1:8000/`.

```bash
./deploy-local.sh stop
```

Use `./deploy-local.sh status`, `./deploy-local.sh restart`, or `./deploy-local.sh logs` to inspect, restart, or follow both service logs. The existing `npm run deploy:local` commands remain available as aliases.

To choose another port, set `DEPLOY_PORT`, for example:

```bash
FRONTEND_PORT=4180 ./deploy-local.sh
```

## Mock data

The browser loads the committed SQLite database at `public/mock-data.sqlite` through SQL.js. To recreate the complete mock dataset:

```bash
python3 scripts/seed_mock_db.py
```

The seed includes projects, plans, plan/set/case relationships, runs, data sets, applications, executors, queues, project members and security rules.

## Verification

```bash
npm run build
npm run test:sites
PYTHONPATH=backend .venv/bin/pytest backend/tests
```

## One-click deployment

Open the **Deploy UI to GitHub Pages** workflow from the badge above, select **Run workflow**, and choose the `main` branch. Every push to `main` also triggers the same deployment automatically.
