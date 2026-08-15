from __future__ import annotations

import argparse
import os
from pathlib import Path

from qa_orbit_agent.server import serve


def default_workspace() -> Path:
    if os.name == "nt":
        base = Path(os.getenv("LOCALAPPDATA", Path.home()))
    else:
        base = Path.home() / "Library" / "Application Support" if os.uname().sysname == "Darwin" else Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "QA Orbit Agent" / "runs"


def main() -> None:
    parser = argparse.ArgumentParser(description="QA Orbit local browser execution agent")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--token", required=True)
    parser.add_argument("--workspace", type=Path, default=default_workspace())
    args = parser.parse_args()
    serve(args.port, args.token, args.workspace)


if __name__ == "__main__":
    main()
