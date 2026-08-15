import tempfile
import unittest
from pathlib import Path

from qa_orbit_agent.models import Task
from qa_orbit_agent.store import TaskStore


class TaskRuntimeTests(unittest.TestCase):
    def test_task_requires_prompt(self):
        with self.assertRaisesRegex(ValueError, "prompt is required"):
            Task.from_payload({"prompt": "  "})

    def test_store_persists_task_without_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TaskStore(Path(directory))
            task = store.add(Task.from_payload({"prompt": "Open example.com", "allowed_domains": ["example.com"]}))
            store.update(task, status="running", log="Started")
            self.assertEqual(store.get(task.id).status, "running")
            payload = (Path(task.workspace) / "task.json").read_text(encoding="utf-8")
            self.assertIn("example.com", payload)
            self.assertNotIn("api_key", payload.lower())
            reloaded = TaskStore(Path(directory)).get(task.id)
            self.assertEqual(reloaded.status, "interrupted")


if __name__ == "__main__":
    unittest.main()
