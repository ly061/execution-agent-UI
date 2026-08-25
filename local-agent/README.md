# QA Orbit Local Agent

Cross-platform PySide6 + QML/Qt Quick desktop application backed by Python and BrowserUse. The Local Agent authenticates to the Execution Agent Server with a server-created API key, claims immutable Run Plans, and executes each run in an isolated browser profile and workspace.

## Development

Requires Python 3.11+. The Server and Local Agent intentionally use separate virtual environments because BrowserUse pins provider SDK versions independently of the Server.

```bash
cd local-agent
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

On Windows, run `.venv\Scripts\python.exe app.py`.

Set one execution provider key before starting: `BROWSER_USE_API_KEY` (default), `OPENAI_API_KEY`, or `DEEPSEEK_API_KEY`. Provider and model can be selected with `QA_ORBIT_LLM_PROVIDER` and `QA_ORBIT_LLM_MODEL`.

Create an Agent API key on the Server. The plaintext key is returned only once:

```bash
curl -X POST http://127.0.0.1:8000/api/agent-keys \
  -H 'Content-Type: application/json' \
  -d '{"name":"Developer Mac"}'
```

Paste the returned `qao_agent_...` value into the QML application's **Connection** page. The key is stored in the operating-system keychain. The Agent then registers the device, sends heartbeats, and polls the Server queue for Run Plans.

The Server URL defaults to `http://127.0.0.1:8000`. Set `QA_ORBIT_SERVER_URL` before the first launch to provide a different deployment default; after the user connects, their saved non-empty URL takes precedence.

The previous Electron shell remains in `electron/` and `renderer/` temporarily as a migration fallback; it is no longer the target architecture.
