# QA Orbit — Execution Agent UI

[![Deploy to GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-d31145?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ly061/execution-agent-UI/actions/workflows/deploy-pages.yml)

Interactive test-management frontend prototype covering Test Plans, Test Sets, Test Cases, Test Data, execution evidence, application configuration, security configuration and project settings.

## LangChain test case agents

The Test cases → Upload cases flow is backed by a Python FastAPI service using LangChain and LangGraph. It reads every Excel sheet, detects header rows, maps similar column names into the standard case schema, preserves unmatched columns, records source provenance, and exposes a conversational correction tool with an audit trail and undo. The Edit test case assistant uses the same backend and project-level DeepSeek configuration to improve the current draft before it is saved.

Set `DEEPSEEK_API_KEY` to enable LangChain semantic mapping and flexible agent language. The service uses DeepSeek's OpenAI-compatible API and defaults to `deepseek-v4-flash`; override it with `DEEPSEEK_MODEL`. Clear aliases and precise corrections continue to work deterministically without a model call.
The integration uses non-thinking mode because LangChain structured output selects a schema tool explicitly, which DeepSeek V4's default thinking mode does not accept.

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
npm run deploy:local
```

This installs locked dependencies, builds the production site and starts it in the background at `http://localhost:4173/`. The committed SQLite mock database is served with the application.
It also installs and starts the LangChain import API at `http://127.0.0.1:8000/`.

```bash
npm run deploy:local:stop
```

To choose another port, set `DEPLOY_PORT`, for example:

```bash
DEPLOY_PORT=4180 npm run deploy:local
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
