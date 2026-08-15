# QA Orbit Local Agent

Cross-platform Electron desktop shell with a Python BrowserUse runtime. Each run gets its own browser profile and workspace under the operating system's application-data directory.

## Development

Requires Node.js and Python 3.11+.

```bash
cd local-agent
npm install
python3 -m venv .venv
.venv/bin/pip install -r runtime/requirements.txt
QA_ORBIT_PYTHON="$PWD/.venv/bin/python" npm run dev
```

On Windows, use `.venv\Scripts\python.exe` for `QA_ORBIT_PYTHON`.

Set one provider key before starting: `BROWSER_USE_API_KEY` (default), `OPENAI_API_KEY`, or `DEEPSEEK_API_KEY`. Provider and model can be selected with `QA_ORBIT_LLM_PROVIDER` and `QA_ORBIT_LLM_MODEL`.

The local HTTP service binds only to `127.0.0.1`. Copy the launch-scoped pairing token from **Connection** into the QA Orbit run dialog to authorize submissions.
