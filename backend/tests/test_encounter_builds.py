"""Encounter build rates must condition on runs that actually reach the
fight: a build that dies in Act 1 can never rank as "handling" an Act 3 boss
just because none of its runs live long enough to face it."""

import numpy as np

from app.services import run_vectors

ENC = b"AEONGLASS_BOSS"


def _fake(monkeypatch, meta, labels, clusters):
    monkeypatch.setattr(
        run_vectors,
        "load_archetypes",
        lambda: {"characters": {"IRONCLAD": clusters}},
    )
    monkeypatch.setattr(run_vectors, "_load_shard", lambda ch: (None, meta))
    monkeypatch.setattr(run_vectors, "_load_labels", lambda ch: labels)


def _clusters():
    return [
        {
            "defining_cards": ["WHIRLWIND"],
            "defining_relics": [],
            "size": 300,
            "win_rate": 50.0,
        },
        {
            "defining_cards": ["FLEX"],
            "defining_relics": [],
            "size": 300,
            "win_rate": 0.0,
        },
        # Relic-only catch-all: not a build, must never appear (archetypes
        # are card-driven).
        {
            "defining_cards": [],
            "defining_relics": ["BLOOD_VIAL"],
            "size": 300,
            "win_rate": 40.0,
        },
    ]


def test_conditioned_rate_uses_runs_that_reached(monkeypatch):
    # Cluster 0: 100 runs reach floor 45+, 10 die to the boss.
    # Cluster 1: dies in act 1 (floor 10) every time — never reaches.
    labels = np.array([0] * 100 + [1] * 100)
    floors = np.array([45] * 100 + [10] * 100, dtype=np.int16)
    kb = np.array([ENC] * 10 + [b""] * 90 + [b"JAW_WORM"] * 100, dtype="S48")
    # Death-floor calibration needs >= 20 samples at the encounter.
    kb[:20] = ENC
    _fake(monkeypatch, {"kb": kb, "floors": floors}, labels, _clusters())

    rows = run_vectors.encounter_builds("AEONGLASS_BOSS")
    assert [r["key"] for r in rows] == ["WHIRLWIND"]  # never-reaches drops out
    row = rows[0]
    assert row["reached"] == 100
    assert row["deaths"] == 20
    assert row["death_rate"] == 20.0  # deaths / reached, not / size


def test_legacy_shards_guard_never_sees_it(monkeypatch):
    # No floors column: the 0%-WR cluster with zero deaths here is "never
    # sees it", not "handles it", and must not appear at all.
    labels = np.array([0] * 100 + [1] * 100)
    kb = np.array([ENC] * 10 + [b""] * 90 + [b"JAW_WORM"] * 100, dtype="S48")
    _fake(monkeypatch, {"kb": kb}, labels, _clusters())

    rows = run_vectors.encounter_builds("AEONGLASS_BOSS")
    assert [r["key"] for r in rows] == ["WHIRLWIND"]
    assert rows[0]["reached"] is None
    assert rows[0]["death_rate"] == round(10 / 300 * 100, 2)  # legacy semantics
