from qa_orbit_desktop.controller import DEFAULT_SERVER_URL, configured_server_url


class FakeSettings:
    def __init__(self, value=""):
        self.stored_value = value

    def value(self, _key, default=""):
        return self.stored_value or default


def test_server_url_uses_local_default(monkeypatch):
    monkeypatch.delenv("QA_ORBIT_SERVER_URL", raising=False)
    assert configured_server_url(FakeSettings()) == DEFAULT_SERVER_URL


def test_server_url_supports_deployment_default(monkeypatch):
    monkeypatch.setenv("QA_ORBIT_SERVER_URL", "https://agent.example.com/")
    assert configured_server_url(FakeSettings()) == "https://agent.example.com"


def test_saved_server_url_takes_precedence(monkeypatch):
    monkeypatch.setenv("QA_ORBIT_SERVER_URL", "https://agent.example.com")
    assert configured_server_url(FakeSettings("https://saved.example.com/")) == "https://saved.example.com"
