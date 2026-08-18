"""Run-report input validation: the email must look like a real address and
the hash must be a share hash."""

from app.routers.feedback import _EMAIL_RE, _HASH_RE


def test_email_regex_accepts_real_addresses():
    for addr in ("a@b.co", "user.name+tag@example.io", "x@sub.domain.org"):
        assert _EMAIL_RE.match(addr), addr


def test_email_regex_rejects_junk():
    for addr in ("", "plainaddress", "a@b", "a@b.c", "a b@c.io", "@x.io", "a@.io"):
        assert not _EMAIL_RE.match(addr), addr


def test_hash_regex():
    assert _HASH_RE.match("1f099ba4e8ff6f47")
    for bad in ("", "1f099ba4e8ff6f4", "1F099BA4E8FF6F47", "zz99ba4e8ff6f477"):
        assert not _HASH_RE.match(bad), bad
