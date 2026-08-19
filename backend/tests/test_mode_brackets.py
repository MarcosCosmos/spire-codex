"""Game-mode brackets must actually receive runs: every run carries exactly
one mode key, and the community blob bracket list keeps it (the allowlists
silently dropped modes from v24 to v25, leaving the Standard/Daily/Custom
pills with blobs nothing had ever accumulated into)."""

from app.services.run_entity_stats import (
    _community_blob_brackets,
    _run_extra_brackets,
)


def test_every_run_carries_exactly_one_mode_key():
    modes = {"standard", "daily", "custom"}
    assert modes & set(_run_extra_brackets(1, 10, "standard")) == {"standard"}
    assert modes & set(_run_extra_brackets(2, 0, "daily")) == {"daily"}
    assert modes & set(_run_extra_brackets(4, 5, "CUSTOM")) == {"custom"}
    assert modes & set(_run_extra_brackets(1, 0, None)) == {"standard"}


def test_community_brackets_keep_the_mode():
    extra = _run_extra_brackets(1, 10, "standard")
    out = _community_blob_brackets(["all", "a10", "solo"], extra)
    assert "standard" in out
    assert out[:3] == ["all", "a10", "solo"]  # shared brackets unchanged

    extra = _run_extra_brackets(2, 0, "daily")
    assert "daily" in _community_blob_brackets(["all", "2p"], extra)

    extra = _run_extra_brackets(3, 0, "custom")
    assert "custom" in _community_blob_brackets(["all", "3p"], extra)
