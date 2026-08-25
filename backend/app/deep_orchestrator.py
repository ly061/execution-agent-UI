from __future__ import annotations

import json
import uuid
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain.tools import tool

from . import database, project_memory
from .llm import create_deepseek_model
from .models import GeneratedCase, ProjectAgentRequest, ProjectAgentResponse


SUPERVISOR_PROMPT = """You are QA Orbit's project-scoped QA supervisor.
Plan complex QA questions, delegate focused analysis when useful, and ground every answer in the supplied
requirements, current draft, and project tools. Project memories are guidance rather than product truth when
they conflict with the current requirements. Never claim that a memory was approved: your memory tool only
creates a candidate for human review. Never directly mutate a case suite; describe a proposed change so the
application can apply it through its validated patch API. Be concise, evidence-based, and surface uncertainty.
"""


def build_project_supervisor(project_id: str, user_id: str | None = None, api_key: str | None = None):
    """Build a Deep Agents supervisor whose tools are permanently scoped to one project."""

    @tool
    def retrieve_project_context(query: str) -> dict[str, Any]:
        """Retrieve active memories, learned style, template, and examples for the current project only."""
        return project_memory.retrieve_context(project_id, user_id, query)

    @tool
    def get_project_profiles() -> dict[str, Any]:
        """Read the current project's learned style and active output template."""
        return {
            "style_profile": database.get_style_profile(project_id, user_id),
            "template_profile": database.get_active_template_profile(project_id),
        }

    @tool
    def review_case_suite(requirements: str, cases_json: str) -> list[dict[str, Any]]:
        """Run deterministic coverage and quality checks over a JSON list of draft test cases."""
        try:
            raw_cases = json.loads(cases_json)
            cases = [GeneratedCase.model_validate(item) for item in raw_cases]
        except (ValueError, TypeError) as error:
            return [{"error": f"Invalid cases JSON: {error}"}]
        context = project_memory.retrieve_context(project_id, user_id, requirements)
        return [item.model_dump(mode="json") for item in project_memory.quality_suggestions(requirements, cases, context)]

    @tool
    def propose_memory(content: str, memory_type: str, evidence: str) -> dict[str, Any]:
        """Create a candidate project memory for human review; this never activates the memory."""
        safe_type = memory_type if memory_type in {"semantic", "episodic", "procedural"} else "semantic"
        return database.save_memory(
            project_id=project_id,
            user_id=user_id,
            content=content,
            memory_type=safe_type,
            confidence=0.6,
            status="candidate",
            source_ids=[evidence] if evidence else [],
        )

    default_tools = [retrieve_project_context, get_project_profiles, review_case_suite]
    subagents = [
        {
            "name": "requirement-analyst",
            "description": "Analyze requirement ambiguity, business rules, roles, states, and traceability gaps.",
            "system_prompt": "Analyze only the supplied requirements and retrieved project evidence. Return gaps with evidence and confidence.",
            "tools": [retrieve_project_context],
        },
        {
            "name": "coverage-reviewer",
            "description": "Review a draft suite for missing negative, boundary, permission, and failure coverage.",
            "system_prompt": "Use review_case_suite first. Separate deterministic findings from additional hypotheses.",
            "tools": [review_case_suite, retrieve_project_context],
        },
        {
            "name": "template-specialist",
            "description": "Explain and apply the current project's learned test-case style and template conventions.",
            "system_prompt": "Use get_project_profiles. Never invent a template field that is absent from the profile.",
            "tools": [get_project_profiles],
        },
    ]
    return create_deep_agent(
        model=create_deepseek_model(api_key=api_key),
        tools=[*default_tools, propose_memory],
        subagents=subagents,
        system_prompt=SUPERVISOR_PROMPT,
        backend=StateBackend(),
        name="qa-orbit-supervisor",
    )


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(block.get("text") or "") if isinstance(block, dict) else str(block) for block in content
        ).strip()
    return str(content)


async def advise_project(
    project_id: str, request: ProjectAgentRequest, api_key: str | None = None
) -> ProjectAgentResponse:
    thread_id = request.thread_id or f"project_agent_{uuid.uuid4().hex}"
    requirements = request.requirements
    cases = list(request.cases)
    if request.generation_session_id:
        row = database.get_generation_session(request.generation_session_id)
        if not row:
            raise ValueError("Generation session was not found.")
        if row["project_id"] != project_id:
            raise ValueError("Generation session does not belong to this project.")
        requirements = requirements or row["requirements_text"]
        if not cases:
            state = json.loads(row["state_json"] or "{}")
            cases = [GeneratedCase.model_validate(item) for item in state.get("cases") or []]
    before = {
        item["id"]
        for item in database.list_memories(
            project_id,
            user_id=request.user_id,
            statuses=("candidate",),
            include_global=False,
        )
    }
    agent = build_project_supervisor(project_id, request.user_id, api_key)
    payload = {
        "request": request.message,
        "requirements": requirements,
        "current_cases": [case.model_dump(mode="json") for case in cases],
        "scope": {"project_id": project_id, "user_id": request.user_id},
    }
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]},
        config={"configurable": {"thread_id": thread_id}},
    )
    candidates = [
        item
        for item in database.list_memories(
            project_id,
            user_id=request.user_id,
            statuses=("candidate",),
            include_global=False,
        )
        if item["id"] not in before
    ]
    return ProjectAgentResponse(
        message=_message_text(result["messages"][-1].content),
        thread_id=thread_id,
        memory_candidates=candidates,
    )
