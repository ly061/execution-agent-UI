# QA Orbit — Execution Agent UI

[![Deploy to GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-d31145?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ly061/execution-agent-UI/actions/workflows/deploy-pages.yml)

Interactive test-management frontend prototype covering Test Plans, Test Sets, Test Cases, Test Data, execution evidence, application configuration, security configuration and project settings.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:4173/`.

## One-command local deployment

```bash
npm run deploy:local
```

This installs locked dependencies, builds the production site and starts it in the background at `http://localhost:4173/`. The committed SQLite mock database is served with the application.

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
```

## One-click deployment

Open the **Deploy UI to GitHub Pages** workflow from the badge above, select **Run workflow**, and choose the `main` branch. Every push to `main` also triggers the same deployment automatically.
