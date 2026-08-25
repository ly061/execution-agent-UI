from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

import keyring
from PySide6.QtCore import Property, QAbstractListModel, QModelIndex, QObject, QSettings, Qt, Signal, Slot

from .agent_loop import ServerAgentLoop


DEFAULT_SERVER_URL = "http://127.0.0.1:8000"


def configured_server_url(settings: QSettings) -> str:
    environment_default = os.getenv("QA_ORBIT_SERVER_URL", DEFAULT_SERVER_URL).strip().rstrip("/")
    default_url = environment_default or DEFAULT_SERVER_URL
    saved_url = str(settings.value("server/url", "") or "").strip().rstrip("/")
    return saved_url or default_url


class TaskListModel(QAbstractListModel):
    IdRole = Qt.UserRole + 1
    TitleRole = Qt.UserRole + 2
    StatusRole = Qt.UserRole + 3
    UpdatedRole = Qt.UserRole + 4
    LastLogRole = Qt.UserRole + 5
    RunPlanRole = Qt.UserRole + 6

    def __init__(self):
        super().__init__()
        self._tasks: list[dict[str, Any]] = []

    def roleNames(self) -> dict[int, bytes]:
        return {
            self.IdRole: b"taskId",
            self.TitleRole: b"title",
            self.StatusRole: b"status",
            self.UpdatedRole: b"updatedAt",
            self.LastLogRole: b"lastLog",
            self.RunPlanRole: b"runPlanId",
        }

    def rowCount(self, parent=QModelIndex()) -> int:
        return 0 if parent.isValid() else len(self._tasks)

    def data(self, index: QModelIndex, role: int = Qt.DisplayRole):
        if not index.isValid() or index.row() >= len(self._tasks):
            return None
        task = self._tasks[index.row()]
        values = {
            self.IdRole: task.get("id", ""),
            self.TitleRole: task.get("title", "Browser task"),
            self.StatusRole: task.get("status", "queued"),
            self.UpdatedRole: task.get("updated_at", ""),
            self.LastLogRole: (task.get("logs") or ["Waiting for execution…"])[-1],
            self.RunPlanRole: task.get("run_plan_id", ""),
        }
        return values.get(role)

    def replace(self, tasks: list[dict[str, Any]]) -> None:
        self.beginResetModel()
        self._tasks = tasks
        self.endResetModel()


class AppController(QObject):
    connectionChanged = Signal()
    configurationChanged = Signal()
    _stateFromWorker = Signal(str, str)
    _tasksFromWorker = Signal(object)

    def __init__(self, workspace_root: Path):
        super().__init__()
        self.settings = QSettings()
        self.workspace_root = workspace_root
        self._server_url = configured_server_url(self.settings)
        self.settings.setValue("server/url", self._server_url)
        self._device_name = self.settings.value("device/name", os.uname().nodename if hasattr(os, "uname") else "This PC")
        self._device_id = self.settings.value("device/id", "") or str(uuid.uuid4())
        self.settings.setValue("device/id", self._device_id)
        try:
            self._api_key = keyring.get_password("QA Orbit Agent", self._device_id) or ""
        except keyring.errors.KeyringError:
            self._api_key = ""
        self._connection_state = "offline"
        self._connection_message = "Enter a Server API Key to connect"
        self.tasks = TaskListModel()
        self.loop: ServerAgentLoop | None = None
        self._stateFromWorker.connect(self._apply_state)
        self._tasksFromWorker.connect(self.tasks.replace)

    @Property(str, notify=configurationChanged)
    def serverUrl(self) -> str:
        return self._server_url

    @Property(str, notify=configurationChanged)
    def apiKey(self) -> str:
        return self._api_key

    @Property(str, notify=configurationChanged)
    def deviceName(self) -> str:
        return self._device_name

    @Property(str, notify=connectionChanged)
    def connectionState(self) -> str:
        return self._connection_state

    @Property(str, notify=connectionChanged)
    def connectionMessage(self) -> str:
        return self._connection_message

    @Property(QObject, constant=True)
    def taskModel(self) -> QObject:
        return self.tasks

    @Slot(str, str, str)
    def connectAgent(self, server_url: str, api_key: str, device_name: str) -> None:
        if not server_url.strip() or not api_key.strip() or not device_name.strip():
            self._apply_state("error", "Server URL, API Key and device name are required.")
            return
        self.disconnectAgent()
        self._server_url = server_url.strip().rstrip("/")
        self._api_key = api_key.strip()
        self._device_name = device_name.strip()
        self.settings.setValue("server/url", self._server_url)
        self.settings.setValue("device/name", self._device_name)
        try:
            keyring.set_password("QA Orbit Agent", self._device_id, self._api_key)
        except keyring.errors.KeyringError:
            pass
        self.configurationChanged.emit()
        self.loop = ServerAgentLoop(
            self._server_url,
            self._api_key,
            self._device_id,
            self._device_name,
            self.workspace_root,
            lambda state, message: self._stateFromWorker.emit(state, message),
            lambda tasks: self._tasksFromWorker.emit(tasks),
        )
        self.loop.start()

    @Slot()
    def disconnectAgent(self) -> None:
        if self.loop:
            self.loop.stop()
            self.loop = None
        self._apply_state("offline", "Disconnected from Execution Agent Server")

    @Slot(str, str)
    def _apply_state(self, state: str, message: str) -> None:
        self._connection_state = state
        self._connection_message = message
        self.connectionChanged.emit()

    def shutdown(self) -> None:
        if self.loop:
            self.loop.stop()
