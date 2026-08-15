from __future__ import annotations

import asyncio
import os
from pathlib import Path

from .models import Task
from .store import TaskStore


class BrowserUseRunner:
    def __init__(self, store: TaskStore):
        self.store = store

    def run(self, task: Task) -> None:
        asyncio.run(self._run(task))

    async def _run(self, task: Task) -> None:
        self.store.update(task, status="running", log="Preparing isolated BrowserUse profile")
        workspace = Path(task.workspace)
        profile = workspace / "browser-profile"
        downloads = workspace / "downloads"
        profile.mkdir(exist_ok=True)
        downloads.mkdir(exist_ok=True)
        try:
            from browser_use import Agent, Browser, ChatBrowserUse, ChatOpenAI

            provider = os.getenv("QA_ORBIT_LLM_PROVIDER", "browser-use").lower()
            if provider == "openai":
                llm = ChatOpenAI(model=os.getenv("QA_ORBIT_LLM_MODEL", "gpt-5-mini"))
            elif provider == "deepseek":
                llm = ChatOpenAI(
                    model=os.getenv("QA_ORBIT_LLM_MODEL", "deepseek-chat"),
                    api_key=os.getenv("DEEPSEEK_API_KEY"),
                    base_url="https://api.deepseek.com",
                )
            else:
                llm = ChatBrowserUse(model=os.getenv("QA_ORBIT_LLM_MODEL", "bu-2-0"))

            browser = Browser(
                headless=task.headless,
                user_data_dir=str(profile),
                allowed_domains=task.allowed_domains or None,
                downloads_path=str(downloads),
            )

            async def on_step(browser_state, agent_output, step_number):
                goal = getattr(getattr(agent_output, "current_state", None), "next_goal", "")
                self.store.update(task, log=f"Step {step_number}: {goal or 'Browser action completed'}")

            async def should_stop() -> bool:
                return task.cancel_requested

            agent = Agent(
                task=task.prompt,
                llm=llm,
                browser=browser,
                task_id=task.id,
                file_system_path=str(workspace / "files"),
                available_file_paths=[str(downloads)],
                register_new_step_callback=on_step,
                register_should_stop_callback=should_stop,
                calculate_cost=True,
            )
            history = await agent.run(max_steps=task.max_steps)
            task.result = history.final_result() or "Task finished without a final message."
            if task.cancel_requested:
                self.store.update(task, status="cancelled", log="Run cancelled")
            else:
                self.store.update(task, status="completed", log="Run completed")
        except ImportError:
            task.error = "BrowserUse is not installed. Run: pip install -r requirements.txt"
            self.store.update(task, status="failed", log=task.error)
        except Exception as exc:  # Runtime failures must be returned to the desktop UI.
            task.error = str(exc)
            self.store.update(task, status="failed", log=f"Run failed: {task.error}")
