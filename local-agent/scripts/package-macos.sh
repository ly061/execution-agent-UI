#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${PROJECT_DIR}/.venv"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  python3.12 -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python" -m pip install -r "${PROJECT_DIR}/requirements.txt"
"${VENV_DIR}/bin/python" -m pip install "pyinstaller>=6.10,<7"

cd "${PROJECT_DIR}"
"${VENV_DIR}/bin/python" -m PyInstaller \
  --noconfirm \
  --clean \
  "${PROJECT_DIR}/QAOrbitAgent.spec"

ARCHIVE_PATH="${PROJECT_DIR}/dist/QA-Orbit-Agent-macOS-arm64.zip"
ARCHIVE_TEMP="${ARCHIVE_PATH}.new"
if [[ -e "${ARCHIVE_TEMP}" ]]; then
  echo "Temporary archive already exists: ${ARCHIVE_TEMP}"
  exit 1
fi
ditto -c -k --sequesterRsrc --keepParent \
  "${PROJECT_DIR}/dist/QA Orbit Agent.app" \
  "${ARCHIVE_TEMP}"
mv -f "${ARCHIVE_TEMP}" "${ARCHIVE_PATH}"

echo "QA Orbit Agent packages created under ${PROJECT_DIR}/dist/."
