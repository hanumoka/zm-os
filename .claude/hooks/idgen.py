#!/usr/bin/env python
"""idgen.py — ULID 생성 (Crockford base32, 26자, 시간정렬) (sonix_docs ML-312 이식).

128-bit = 48-bit ms timestamp + 80-bit entropy. 사전순(lexicographic) = 시간순.
- new_ulid(ts_ms=None)         : 랜덤 entropy — 라이브 발급
- deterministic_ulid(ts_ms, seed): seed 파생 entropy — 멱등 backfill(같은 입력 → 같은 ULID)
- ml_entity_id(ts_ms, seed)    : 'ml_' 접두 entity_id (호환 명칭 유지 — wu_claim_manager 가 import)

중앙 조정 불필요(로컬 생성). Python hook 내 time/os/hashlib 만 사용.
"""
import os
import time
import hashlib

# Crockford base32 — I, L, O, U 제외(혼동 방지).
_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _b32(value, length):
    """value 를 Crockford base32 로 고정폭 length 자 인코딩(MSB-first)."""
    out = []
    for _ in range(length):
        out.append(_CROCKFORD[value & 0x1F])
        value >>= 5
    return "".join(reversed(out))


def _compose(ts_ms, entropy):
    ts_ms &= (1 << 48) - 1          # 48-bit timestamp → 10 자
    entropy &= (1 << 80) - 1        # 80-bit entropy   → 16 자
    return _b32(ts_ms, 10) + _b32(entropy, 16)


def new_ulid(ts_ms=None):
    """랜덤 ULID(라이브 발급). ts_ms 미지정 시 현재 시각."""
    if ts_ms is None:
        ts_ms = int(time.time() * 1000)
    return _compose(ts_ms, int.from_bytes(os.urandom(10), "big"))


def deterministic_ulid(ts_ms, seed):
    """seed 파생 ULID(멱등 backfill). 같은 (ts_ms, seed) → 항상 같은 ULID."""
    digest = hashlib.sha256(str(seed).encode("utf-8")).digest()
    return _compose(ts_ms, int.from_bytes(digest[:10], "big"))


def ml_entity_id(ts_ms, seed=None):
    """'ml_' 접두 불변 내부키. seed 있으면 멱등, 없으면 랜덤. (명칭은 호환 유지)"""
    ulid = deterministic_ulid(ts_ms, seed) if seed is not None else new_ulid(ts_ms)
    return "ml_" + ulid


# 일반화 별칭 (zm-os 어휘) — 동작 동일
entity_id = ml_entity_id


if __name__ == "__main__":
    assert len(new_ulid()) == 26, "ULID 길이 26 아님"
    pool = [new_ulid() for _ in range(5000)]
    assert len(set(pool)) == 5000, "ULID 충돌 발생"
    assert deterministic_ulid(1717000000000, "WU-1") == \
        deterministic_ulid(1717000000000, "WU-1"), "결정론 불일치"
    assert new_ulid(1000) < new_ulid(2000), "시간정렬 위반"
    assert ml_entity_id(1717000000000, "WU-1").startswith("ml_")
    print("SMOKE OK — 5000 unique, deterministic stable, time-sortable, 26-char")
    print("  sample new:", new_ulid())
