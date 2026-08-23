"""Game-mode brackets must actually receive runs: every run carries exactly
one mode key, and that key survives into the composed bracket set (the
allowlists silently dropped modes from v24 to v25, leaving the
Standard/Daily/Custom pills with blobs nothing had ever accumulated into)."""

from app.services.run_entity_stats import _run_extra_brackets, axis_combos

MODES = {"standard", "daily", "custom"}


def test_every_run_carries_exactly_one_mode_key():
    assert MODES & set(_run_extra_brackets(1, 10, "standard")) == {"standard"}
    assert MODES & set(_run_extra_brackets(2, 0, "daily")) == {"daily"}
    assert MODES & set(_run_extra_brackets(4, 5, "CUSTOM")) == {"custom"}
    assert MODES & set(_run_extra_brackets(1, 0, None)) == {"standard"}


def test_the_mode_survives_into_the_composed_keys():
    extra = _run_extra_brackets(1, 10, "standard")
    players = [b for b in extra if b in ("solo", "2p", "3p", "4p")]
    skills = [b for b in extra if b in ("a10", "wr30", "wr50", "wr75")]
    modes = [b for b in extra if b in MODES]
    keys = set(axis_combos(players, skills, modes))
    assert "standard" in keys
    assert "solo:a10:standard" in keys
