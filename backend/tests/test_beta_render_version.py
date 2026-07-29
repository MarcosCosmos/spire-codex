"""Hotfix versions with no render archive of their own point at the set
they reuse via data-beta/<version>/render-version; without the pointer the
version flip to v0.109.1 404'd every beta card render."""

from app.services import data_service


def _beta_tree(tmp_path, version, pointer=None):
    (tmp_path / "latest").write_text(version, encoding="utf-8")
    vdir = tmp_path / version
    vdir.mkdir()
    if pointer is not None:
        (vdir / "render-version").write_text(pointer, encoding="utf-8")
    return tmp_path


def test_pointer_redirects_render_version(tmp_path, monkeypatch):
    monkeypatch.setattr(
        data_service, "BETA_DATA_DIR", _beta_tree(tmp_path, "v0.109.1", "v0.109.0")
    )
    assert data_service.get_beta_version() == "v0.109.1"
    assert data_service.get_beta_render_version() == "v0.109.0"


def test_pointer_without_v_prefix_is_normalized(tmp_path, monkeypatch):
    monkeypatch.setattr(
        data_service, "BETA_DATA_DIR", _beta_tree(tmp_path, "v0.109.1", "0.109.0")
    )
    assert data_service.get_beta_render_version() == "v0.109.0"


def test_no_pointer_falls_back_to_beta_version(tmp_path, monkeypatch):
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", _beta_tree(tmp_path, "v0.109.0"))
    assert data_service.get_beta_render_version() == "v0.109.0"


def test_no_beta_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", tmp_path)
    assert data_service.get_beta_render_version() is None
