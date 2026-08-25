from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent

from PySide6.QtCore import QCoreApplication, QUrl
from PySide6.QtGui import QGuiApplication
from PySide6.QtQml import QQmlApplicationEngine

from qa_orbit_desktop.controller import AppController


def workspace_root() -> Path:
    if os.name == "nt":
        base = Path(os.getenv("LOCALAPPDATA", Path.home()))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "QA Orbit Agent" / "runs"


def main() -> int:
    QCoreApplication.setOrganizationName("QA Orbit")
    QCoreApplication.setApplicationName("QA Orbit Agent")
    application = QGuiApplication(sys.argv)
    controller = AppController(workspace_root())
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("backend", controller)
    engine.load(QUrl.fromLocalFile(str(ROOT / "qml" / "Main.qml")))
    if not engine.rootObjects():
        return 1
    application.aboutToQuit.connect(controller.shutdown)
    return application.exec()


if __name__ == "__main__":
    raise SystemExit(main())
