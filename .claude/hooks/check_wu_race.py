#!/usr/bin/env python
"""check_wu_race.py — pre-push WU claim 경합 가드 (sonix check_ml_number_race 이식·일반화).

push 대상 브랜치의 events `wu_claim` 별칭(WU-ID)이 origin 에 **다른 entity_id 로**
이미 기록돼 있으면 push 를 BLOCK 한다.

주의(zm-os): entity_id 는 WU-ID 결정론적(idgen.deterministic_ulid(0, wu_id)) 이므로
같은 WU 를 두 머신이 claim 해도 entity_id 가 동일 → 정상적으로 경합이 발생하지 않는다.
본 가드는 구조적 안전망(향후 비결정론 발급 도입 대비)으로 유지된다.

호출(pre-push hook): python .claude/hooks/check_wu_race.py <branch>
exit 0 = OK, 1 = 경합(BLOCK).
"""
import sys
import json
import subprocess


def _run(args, timeout=30):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", timeout=timeout)


def claims_from_ref(ref):
    """ref 의 events/*.jsonl wu_claim → {wu: set(entity_id)}."""
    out = {}
    ls = _run(["git", "ls-tree", "-r", "--name-only", ref, "events/"])
    if ls.returncode != 0:
        return out
    for path in ls.stdout.splitlines():
        if not path.endswith(".jsonl"):
            continue
        show = _run(["git", "show", f"{ref}:{path}"])
        if show.returncode != 0:
            continue
        for line in show.stdout.splitlines():
            line = line.strip()
            if not line or '"wu_claim"' not in line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ev.get("type") != "wu_claim":
                continue
            wu = (ev.get("details") or {}).get("wu")
            if wu:
                out.setdefault(wu, set()).add(ev.get("entity_id"))
    return out


def find_collisions(local, origin):
    collisions = []
    for wu, local_eids in local.items():
        oe = origin.get(wu)
        if oe and (local_eids - oe) and (oe - local_eids):
            collisions.append((wu, sorted(local_eids), sorted(oe)))
    return collisions


def main():
    branch = sys.argv[1] if len(sys.argv) > 1 else ""
    if not branch:
        return 0
    try:
        _run(["git", "fetch", "origin", branch])
    except Exception:
        pass
    origin_ref = f"origin/{branch}"
    if _run(["git", "rev-parse", "--verify", "--quiet", origin_ref]).returncode != 0:
        return 0
    collisions = find_collisions(claims_from_ref("HEAD"), claims_from_ref(origin_ref))
    if collisions:
        sys.stderr.write("\n[BLOCK] WU claim 경합 — 같은 WU 가 origin 에 다른 entity_id 로 존재합니다:\n")
        for wu, le, oe in collisions:
            sys.stderr.write(f"  - {wu}: local={le} vs origin={oe}\n")
        sys.stderr.write("  해소: `git fetch` 후 충돌 정리 → 재push. (--no-verify 우회 금지)\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
