import pytest


@pytest.fixture(autouse=True)
def working_folder(tmp_path, monkeypatch):
    """The analyzer saves the Program in the working folder to run it, so each test gets an empty one."""
    monkeypatch.chdir(tmp_path)
    return tmp_path
