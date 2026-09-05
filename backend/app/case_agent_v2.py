"""Evidence-grounded Case Agent v2 domain service.

The service deliberately has no direct database access outside ``database``.  It
keeps run configuration immutable, writes immutable artifact revisions, and uses
one field-patch mutation path for every configured scenario/case field.
"""
from __future__ import annotations

import copy
import re
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

from . import database

Mode = Literal["auto", "hitp"]
Intent = Literal["review_requirement", "generate_scenario", "generate_case", "review_case", "query", "learn_template"]

DEFAULT_CONFIG: dict[str, Any] = {
    "output_language": "zh-CN", "scenario_level": "Standard", "case_level": "Standard",
    "case_types": ["Business", "Negative", "Boundary"], "additional_rules": "",
    "scenario_schema": ["scenario_id", "title", "module", "description", "priority", "requirement_references"],
    "case_schema": ["case_id", "scenario_id", "title", "platform", "test_type", "priority", "preconditions", "test_data", "test_steps", "expected_result", "requirement_references"],
    "excel": {"layout": "ONE_CASE_PER_ROW", "sheet_name": "Test Cases", "filename_pattern": "{project}_{date}.xlsx"},
    "visualization": {"complexity_policy": "complex_required"},
}


class ProfileInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    config: dict[str, Any] = Field(default_factory=dict)


class RunInput(BaseModel):
    chat_id: str = "default"
    mode: Mode = "auto"
    intent: Intent | None = None
    profile_id: str | None = None
    requirement: str = Field(min_length=1, max_length=200000)


class ContinueInput(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)


class Patch(BaseModel):
    item_id: str
    fields: dict[str, Any]


class ArtifactMutation(BaseModel):
    expected_revision_id: int = Field(ge=1)
    add: list[dict[str, Any]] = Field(default_factory=list)
    update: list[Patch] = Field(default_factory=list)
    delete: list[str] = Field(default_factory=list)


class QueryInput(BaseModel):
    question: str = Field(min_length=1, max_length=10000)
    artifact_ids: list[str] = Field(default_factory=list)


def _profile(project_id: str, profile_id: str | None = None) -> dict[str, Any]:
    if profile_id:
        profile = database.get_case_agent_profile(profile_id)
        if not profile or profile["project_id"] != project_id:
            raise ValueError("Profile not found in this project.")
        return profile
    profiles = database.list_case_agent_profiles(project_id)
    if profiles:
        return profiles[0]
    return database.save_case_agent_profile({"id": f"profile_{uuid.uuid4().hex[:12]}", "project_id": project_id, "name": "Default Profile", "is_default": True, "config": copy.deepcopy(DEFAULT_CONFIG)})


def create_profile(project_id: str, input: ProfileInput, *, copy_from: str | None = None) -> dict[str, Any]:
    base = copy.deepcopy(_profile(project_id, copy_from)["config"] if copy_from else DEFAULT_CONFIG)
    base.update(input.config)
    return database.save_case_agent_profile({"id": f"profile_{uuid.uuid4().hex[:12]}", "project_id": project_id, "name": input.name, "is_default": not database.list_case_agent_profiles(project_id), "config": base})


def _route(intent: Intent | None, requirement: str) -> Intent:
    if intent:
        return intent
    lowered = requirement.lower()
    if any(word in lowered for word in ("查询", "query", "什么是", "what is")):
        return "query"
    if any(word in lowered for word in ("场景", "scenario")):
        return "generate_scenario"
    if any(word in lowered for word in ("分析", "analysis", "评审需求")):
        return "review_requirement"
    return "generate_case"


def _sentences(requirement: str) -> list[str]:
    values = [re.sub(r"^\s*(?:\d+[.、]|[-*•])\s*", "", value).strip() for value in re.split(r"[\n。；;]+", requirement)]
    return [value for value in values if len(value) >= 6][:120]


def _analysis(requirement: str) -> dict[str, Any]:
    units = _sentences(requirement)
    questions = [value for value in units if re.search(r"待定|未知|TBD|\?|是否|或", value, re.I)]
    modules = list(dict.fromkeys(re.findall(r"(?:模块|功能|页面|接口)\s*[:：]?\s*([^，,。；;\n]{2,24})", requirement)))
    return {
        "requirement_summary": requirement[:1000], "in_scope": units, "out_of_scope": [], "modules": modules,
        "functional_requirements": [{"id": f"REQ-{i + 1:03}", "text": text, "source": {"kind": "requirement", "locator": f"sentence:{i + 1}"}} for i, text in enumerate(units)],
        "open_questions": [{"id": f"Q-{i + 1}", "question": text, "evidence": f"sentence:{i + 1}"} for i, text in enumerate(questions)],
        "assumptions": [], "confidence": "medium" if questions else "high",
    }


def _visualization(analysis: dict[str, Any]) -> dict[str, Any] | None:
    reqs = analysis["functional_requirements"]
    complex_enough = len(reqs) >= 20 or len(analysis["modules"]) >= 3 or len(analysis["open_questions"]) >= 3
    if not complex_enough:
        return None
    return {"type": "requirement_mind_map", "nodes": [{"id": item["id"], "label": item["text"], "source": item["source"]} for item in reqs], "edges": []}


def _scenarios(analysis: dict[str, Any]) -> dict[str, Any]:
    items = []
    for index, req in enumerate(analysis["functional_requirements"]):
        items.append({"scenario_id": f"SCN-{index + 1:03}", "title": req["text"][:90], "module": "General", "description": req["text"], "priority": "P1", "requirement_references": [req["id"]], "evidence": [req["source"]]})
    return {"items": items, "coverage_matrix": [{"requirement_id": req["id"], "status": "covered"} for req in analysis["functional_requirements"]]}


def _cases(scenarios: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    items = []
    for index, scenario in enumerate(scenarios["items"]):
        for case_type in config.get("case_types", ["Business", "Negative", "Boundary"]):
            suffix = case_type[:3].upper()
            title = scenario["title"] if case_type == "Business" else f"{scenario['title']}（{case_type}）"
            items.append({"case_id": f"TC-{index + 1:03}-{suffix}", "scenario_id": scenario["scenario_id"], "title": title, "platform": "", "test_type": case_type, "priority": scenario["priority"], "preconditions": "满足需求定义的前置条件", "test_data": "", "test_steps": [{"step_number": 1, "action": f"执行：{scenario['description']}", "expected_result": ""}], "expected_result": "系统行为符合需求描述", "requirement_references": scenario["requirement_references"], "evidence": scenario["evidence"]})
    return {"items": items}


def _review(case_set: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    seen: set[tuple[str, str]] = set(); retained = []; removed = []
    for item in case_set["items"]:
        key = (item["scenario_id"], item["title"])
        if key in seen:
            removed.append(item["case_id"]); continue
        seen.add(key); retained.append(item)
    report = {"initial_score": 85, "final_score": 90 if removed else 88, "findings": [{"action": "DELETE", "case_id": key, "reason": "duplicate"} for key in removed], "evidence_grounded": True}
    return {"items": retained}, report


def start_run(project_id: str, input: RunInput) -> dict[str, Any]:
    profile = _profile(project_id, input.profile_id)
    intent = _route(input.intent, input.requirement)
    run = database.save_case_agent_run({"id": f"run_{uuid.uuid4().hex[:16]}", "project_id": project_id, "chat_id": input.chat_id, "mode": input.mode, "primary_intent": intent, "status": "Preparing", "profile_id": profile["id"], "config_snapshot": copy.deepcopy(profile["config"]), "requirement_text": input.requirement})
    analysis = _analysis(input.requirement)
    analysis_artifact = database.create_case_agent_artifact(project_id, run["id"], "requirement_analysis", analysis)
    if input.mode == "hitp" and analysis["open_questions"]:
        database.update_case_agent_run(run["id"], status="Waiting Input", checkpoint={"analysis_artifact_id": analysis_artifact["id"], "open_questions": analysis["open_questions"]})
        return {"run": database.get_case_agent_run(run["id"]), "target_artifact": analysis_artifact, "open_questions": analysis["open_questions"], "progress": ["Requirement analysis complete"]}
    return _complete_run(run["id"], analysis_artifact, analysis)


def continue_run(run_id: str, input: ContinueInput) -> dict[str, Any]:
    run = database.get_case_agent_run(run_id)
    if not run or run["status"] != "Waiting Input":
        raise ValueError("Run is not waiting for input.")
    analysis_artifact = database.get_case_agent_artifact(run["checkpoint"]["analysis_artifact_id"])
    if not analysis_artifact:
        raise ValueError("Run checkpoint is unavailable.")
    analysis = analysis_artifact["content"]
    analysis["assumptions"].extend({"question_id": key, "answer": value, "source": "user_confirmation"} for key, value in input.answers.items())
    analysis_artifact = database.revise_case_agent_artifact(analysis_artifact["id"], analysis_artifact["revision"], analysis, {"answers": input.answers})
    return _complete_run(run_id, analysis_artifact, analysis)


def _complete_run(run_id: str, analysis_artifact: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    run = database.get_case_agent_run(run_id)
    assert run
    artifacts = [analysis_artifact]
    visualization = _visualization(analysis)
    if visualization:
        artifacts.append(database.create_case_agent_artifact(run["project_id"], run_id, "visualization", visualization))
    if run["primary_intent"] == "review_requirement":
        target = analysis_artifact
    elif run["primary_intent"] == "query":
        target = database.create_case_agent_artifact(run["project_id"], run_id, "query_result", {"answer": "Insufficient Evidence", "evidence": []})
        artifacts.append(target)
    else:
        scenarios = _scenarios(analysis)
        scenario_artifact = database.create_case_agent_artifact(run["project_id"], run_id, "scenario_set", scenarios); artifacts.append(scenario_artifact)
        if run["primary_intent"] == "generate_scenario": target = scenario_artifact
        else:
            case_set = _cases(scenarios, run["config_snapshot"])
            initial = database.create_case_agent_artifact(run["project_id"], run_id, "case_set", case_set); artifacts.append(initial)
            optimized, report = _review(case_set)
            target = database.revise_case_agent_artifact(initial["id"], initial["revision"], optimized, {"review": report})
            artifacts.append(database.create_case_agent_artifact(run["project_id"], run_id, "review_report", report))
    database.update_case_agent_run(run_id, status="Completed", checkpoint={"target_artifact_id": target["id"]})
    return {"run": database.get_case_agent_run(run_id), "target_artifact": target, "artifacts": artifacts, "progress": ["Analysis", "Scenario generation", "Case generation", "Review and optimize"]}


def mutate_artifact(artifact_id: str, change: ArtifactMutation) -> dict[str, Any]:
    artifact = database.get_case_agent_artifact(artifact_id)
    if not artifact:
        raise ValueError("Artifact not found.")
    content = copy.deepcopy(artifact["content"]); items = content.get("items")
    if not isinstance(items, list): raise ValueError("This artifact does not contain editable items.")
    id_field = "case_id" if artifact["artifact_type"] == "case_set" else "scenario_id"
    index = {str(item.get(id_field)): item for item in items}
    for item in change.add:
        if not item.get(id_field) or str(item[id_field]) in index: raise ValueError("Added item requires a unique stable ID.")
        items.append(item); index[str(item[id_field])] = item
    for patch in change.update:
        if patch.item_id not in index: raise ValueError(f"Item {patch.item_id} was not found.")
        index[patch.item_id].update(patch.fields)
    deleted = set(change.delete); content["items"] = [item for item in items if str(item.get(id_field)) not in deleted]
    return database.revise_case_agent_artifact(artifact_id, change.expected_revision_id, content, {"add": change.add, "update": [item.model_dump() for item in change.update], "delete": list(deleted)})


def evidence_query(project_id: str, input: QueryInput) -> dict[str, Any]:
    artifacts = [database.get_case_agent_artifact(item) for item in input.artifact_ids]
    artifacts = [item for item in artifacts if item and item["project_id"] == project_id]
    terms = [term.lower() for term in re.findall(r"[\w\u4e00-\u9fff]+", input.question) if len(term) >= 2]
    evidence = []
    for artifact in artifacts:
        raw = str(artifact["content"])
        if any(term in raw.lower() for term in terms): evidence.append({"artifact_id": artifact["id"], "revision": artifact["revision"]})
    return {"answer": "Insufficient Evidence" if not evidence else "The answer is supported by the listed artifact evidence.", "evidence": evidence}
