from __future__ import annotations

from app import case_agent_v2, database


def _isolated_db(monkeypatch, tmp_path):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "case-agent.sqlite")
    database.init_db()


def test_auto_run_generates_reviewed_case_revision(monkeypatch, tmp_path):
    _isolated_db(monkeypatch, tmp_path)
    result = case_agent_v2.start_run(
        "project-a",
        case_agent_v2.RunInput(mode="auto", requirement="用户可以登录。系统校验密码。失败时给出提示。"),
    )
    assert result["run"]["status"] == "Completed"
    assert result["target_artifact"]["artifact_type"] == "case_set"
    assert result["target_artifact"]["revision"] == 2  # initial generation + fixed review pass
    assert result["target_artifact"]["content"]["items"]


def test_hitp_waits_only_for_open_questions_then_resumes(monkeypatch, tmp_path):
    _isolated_db(monkeypatch, tmp_path)
    waiting = case_agent_v2.start_run(
        "project-a", case_agent_v2.RunInput(mode="hitp", intent="generate_case", requirement="用户是否可使用第三方登录？")
    )
    assert waiting["run"]["status"] == "Waiting Input"
    completed = case_agent_v2.continue_run(waiting["run"]["id"], case_agent_v2.ContinueInput(answers={"Q-1": "暂不支持"}))
    assert completed["run"]["status"] == "Completed"


def test_artifact_mutation_requires_matching_revision(monkeypatch, tmp_path):
    _isolated_db(monkeypatch, tmp_path)
    result = case_agent_v2.start_run("project-a", case_agent_v2.RunInput(requirement="用户可以提交订单。"))
    artifact = result["target_artifact"]
    item = artifact["content"]["items"][0]
    changed = case_agent_v2.mutate_artifact(
        artifact["id"],
        case_agent_v2.ArtifactMutation(expected_revision_id=artifact["revision"], update=[case_agent_v2.Patch(item_id=item["case_id"], fields={"priority": "P0"})]),
    )
    assert changed["content"]["items"][0]["priority"] == "P0"
