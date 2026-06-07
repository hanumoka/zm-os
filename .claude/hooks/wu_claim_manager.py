#!/usr/bin/env python
"""wu_claim_manager.py — Work-Unit(WU) claim/release/sweep/touch (sonix ml_claim_manager 일반화 이식).

zm-os 적응 (REFAC-WU):
  - task 키 = 임의 식별자 문자열(REFAC-02-P2, USR-01, Epic-J, WU-7 ...). ML-NNN 자동증번 미도입.
  - .project-memory/claims/<WU>.json 를 SSOT 로 사용 (claim 당 1파일 → 머지 충돌 구조적 0).
  - roadmap 마커 갱신은 best-effort(docs/04-planning/02-roadmap.md). 미발견 시 claims+events 가 SSOT.
  - events: wu_claim / wu_release / wu_state_change (id_reserve/ml_relate 미사용). entity_id = WU 결정론적 ULID.

CLI:
  claim <WU> [--takeover]
  release <WU> (완료|중단|차단)
  sweep
  gc-worktrees
  next            # (옵션) ad-hoc WU-NNN 다음 번호 — 명명 작업엔 불필요
  touch
  mark-stopped
  status [WU]

Exit codes: 0 success, 1 rejection(conflict), 2 error.
"""
import sys
import os
import json
import subprocess
import re
import argparse
import contextlib
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import file_lock as _fl
    import emit_event as _emit
    import idgen as _idgen
except ImportError:  # 의존 모듈 부재 시 graceful (claim 자체는 동작)
    _fl = _emit = _idgen = None

HEARTBEAT_TIMEOUT_SEC = 300
TOUCH_THROTTLE_SEC = 60
ROADMAP_FILE = "docs/04-planning/02-roadmap.md"
CLAIMS_FILE = ".project-memory/wu-claims.json"   # legacy 단일 파일 (전환기 dual-read)
CLAIMS_DIR = ".project-memory/claims"            # per-WU 샤딩 (claims/<WU>.json)
HOOKS_DIR = ".claude/hooks"
EVENTS_DIR = "events"
DERIVED_WU_STATE = "docs/04-planning/_derived-wu-state.md"

VALID_OUTCOMES = {"완료": "✅", "중단": "⬜", "차단": "🚫"}
STATE_MARKERS = "⬜🔵✅🚫🟡✖❌🔧⏸"
VALID_TRANSITIONS = {"🔵": ("⬜", "🟡"), "✅": ("🔵",), "⬜": ("🔵",), "🚫": ("🔵",)}


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')


def project_root():
    p = Path.cwd().resolve()
    while p != p.parent:
        if (p / ".claude").is_dir() and (p / ".git").exists():
            return p
        p = p.parent
    raise RuntimeError("project root not found (no .claude/ + .git)")


def resolve_user(root):
    try:
        git_user = subprocess.run(
            ["git", "-C", str(root), "config", "user.name"],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3
        ).stdout.strip() or "unknown"
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(root / HOOKS_DIR / "_resolve-user.py"), git_user],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3
        )
        parts = result.stdout.strip().split()
        if len(parts) >= 4:
            prefix, ctx_suffix, name, user_id = parts[0], parts[1], parts[2], parts[3]
            if prefix == "_":
                prefix = ""
            return {"git_user": git_user, "prefix": prefix, "ctx_suffix": ctx_suffix,
                    "name": name, "user_id": user_id}
    except Exception:
        pass
    return {"git_user": "unknown", "prefix": "", "ctx_suffix": "unknown",
            "name": "unknown", "user_id": "M??"}


def get_session_id():
    return os.environ.get("CLAUDE_CODE_SESSION_ID", "")


def detect_subagent():
    for key in ("CLAUDE_CODE_PARENT_SESSION_ID", "CLAUDE_AGENT_TYPE", "CLAUDE_TEAM_NAME"):
        val = os.environ.get(key)
        if val:
            return f"{key}={val}"
    return None


def session_short(session_id):
    return session_id.split("-")[0] if session_id else "unknown"


def detect_session_seq(root, prefix):
    """zm-os 에는 _active-{prefix}.md 가 없을 수 있음 → 없으면 None (graceful)."""
    if not prefix:
        return None
    f = root / f"docs/12-changelog/_active-{prefix}.md"
    if not f.exists():
        return None
    try:
        content = f.read_text(encoding='utf-8')
        matches = re.findall(r'(?:^|\s|\()S(\d{3,4})\b', content)
        if matches:
            return f"S{max(int(m) for m in matches)}"
    except Exception:
        pass
    return None


def _claims_lock(claims_path):
    if _fl is not None:
        return _fl.file_lock(claims_path, timeout=5)
    return contextlib.nullcontext()


# ── claim 샤딩 (per-WU 1파일) ──────────────────────────────────────────

def _shard_rel(wu_id):
    return f"{CLAIMS_DIR}/{wu_id}.json"


def claim_shard_path(root, wu_id):
    return root / CLAIMS_DIR / f"{wu_id}.json"


def write_claims_atomic(claims_path, data):
    tmp = claims_path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding='utf-8')
    os.replace(tmp, claims_path)


def read_all_claims(root):
    """legacy wu-claims.json + per-WU 샤드 병합. 샤드 우선."""
    claims = {}
    legacy = root / CLAIMS_FILE
    if legacy.exists():
        try:
            with legacy.open(encoding='utf-8') as f:
                claims.update((json.load(f) or {}).get("claims", {}))
        except Exception:
            pass
    cdir = root / CLAIMS_DIR
    if cdir.is_dir():
        for p in sorted(cdir.glob("*.json")):
            if p.name.endswith(".tmp.json") or p.suffix == ".lock":
                continue
            try:
                with p.open(encoding='utf-8') as f:
                    entry = json.load(f)
                if isinstance(entry, dict) and "claimed_by" in entry:
                    claims[p.stem] = entry
            except Exception:
                continue
    return {"schema_version": 1, "claims": claims}


def write_claim_shard(root, wu_id, entry):
    cdir = root / CLAIMS_DIR
    cdir.mkdir(parents=True, exist_ok=True)
    path = cdir / f"{wu_id}.json"
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + "\n", encoding='utf-8')
    os.replace(tmp, path)


def purge_legacy_entry(root, wu_id):
    legacy = root / CLAIMS_FILE
    if not legacy.exists():
        return False
    try:
        with legacy.open(encoding='utf-8') as f:
            data = json.load(f) or {}
    except Exception:
        return False
    if wu_id in data.get("claims", {}):
        del data["claims"][wu_id]
        write_claims_atomic(legacy, data)
        return True
    return False


def delete_claim_shard(root, wu_id):
    changed = []
    path = claim_shard_path(root, wu_id)
    if path.exists():
        path.unlink()
        changed.append(_shard_rel(wu_id))
    if purge_legacy_entry(root, wu_id):
        changed.append(CLAIMS_FILE)
    return changed


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def is_stale(entry):
    hb = parse_iso(entry.get("heartbeat_at") or entry.get("claimed_at"))
    if not hb:
        return True
    age = (datetime.now(timezone.utc).astimezone() - hb).total_seconds()
    return age > HEARTBEAT_TIMEOUT_SEC


# ── roadmap 마커 (best-effort) ────────────────────────────────────────

def update_roadmap_state(root, wu_id, new_marker, expected_from=None):
    """roadmap.md 의 WU 행 상태 마커 갱신. 표/마커 구조가 없으면 best-effort skip."""
    f = root / ROADMAP_FILE
    if not f.exists():
        return False, "roadmap not found"
    content = f.read_text(encoding='utf-8')
    pattern = re.compile(
        r'(' + re.escape(wu_id) + r'\b[^\n]*?\|)\s*([' + STATE_MARKERS + r'])\s*(\|)',
        re.MULTILINE
    )
    m = pattern.search(content)
    if not m:
        return False, f"{wu_id} 상태 마커 행 없음 (best-effort skip)"
    current = m.group(2)
    if current == new_marker:
        return False, f"already {new_marker}"
    allowed = VALID_TRANSITIONS.get(new_marker)
    if expected_from is not None:
        if current != expected_from:
            return False, f"current '{current}' != expected '{expected_from}' (외부 변경) — skip"
    elif allowed and current not in allowed:
        return False, f"transition '{current}' → '{new_marker}' not allowed"
    new_content = content[:m.start()] + m.group(1) + ' ' + new_marker + ' ' + m.group(3) + content[m.end():]
    f.write_text(new_content, encoding='utf-8')
    return True, f"{current} → {new_marker}"


def git_commit_push(root, message, files):
    if os.environ.get("ML_CLAIM_DRY_RUN") == "1":
        return True, f"DRY_RUN [{message}] files={files}"
    try:
        if not files:
            return True, "no files"
        subprocess.run(["git", "-C", str(root), "add", "--"] + files,
                       check=True, capture_output=True, text=True, timeout=10)
        diff = subprocess.run(["git", "-C", str(root), "diff", "--cached", "--quiet"],
                              capture_output=True, text=True, timeout=5)
        if diff.returncode == 0:
            return True, "nothing to commit"
        subprocess.run(["git", "-C", str(root), "commit", "-m", message],
                       check=True, capture_output=True, text=True, timeout=15)
        push = subprocess.run(["git", "-C", str(root), "push"],
                              capture_output=True, text=True, timeout=60)
        if push.returncode != 0:
            return False, f"push failed: {(push.stderr or push.stdout).strip()[:200]}"
        return True, "committed+pushed"
    except subprocess.CalledProcessError as e:
        return False, f"git error: {(e.stderr or e.stdout or str(e)).strip()[:200]}"
    except subprocess.TimeoutExpired:
        return False, "git timeout"


def _is_same_user(entry, user, session_id):
    if entry.get("session_id") == session_id and session_id:
        return True
    if entry.get("user_id") == user["user_id"] and user["user_id"] != "M??":
        return True
    return False


# ── Worktree GC ───────────────────────────────────────────────────────

def _run_git(cwd, args, timeout=15):
    return subprocess.run(["git", "-C", str(cwd)] + args,
                          capture_output=True, text=True, timeout=timeout, encoding="utf-8")


def worktree_name_for(wu_id):
    """임의 WU-ID → 안전한 worktree 이름 (lowercase kebab). 예: REFAC-02-P2 → refac-02-p2."""
    return re.sub(r'[^a-z0-9]+', '-', wu_id.lower()).strip('-')


def _under_worktrees_dir(path):
    return "/.claude/worktrees/" in str(path).replace("\\", "/")


def list_worktrees(root):
    r = _run_git(root, ["worktree", "list", "--porcelain"], timeout=10)
    items, cur = [], {}
    for line in r.stdout.splitlines():
        if line.startswith("worktree "):
            cur = {"path": line[9:]}
        elif line.startswith("branch "):
            cur["branch"] = line[7:].replace("refs/heads/", "")
        elif not line.strip():
            if cur.get("path"):
                items.append(cur)
            cur = {}
    if cur.get("path"):
        items.append(cur)
    return items


def integration_ref(root, worktrees):
    base = "main"  # zm-os 통합 브랜치 = main
    for wt in worktrees:
        if not _under_worktrees_dir(wt["path"]) and wt.get("branch"):
            base = wt["branch"]
            break
    if _run_git(root, ["rev-parse", "--verify", "--quiet", f"origin/{base}"]).returncode == 0:
        return f"origin/{base}"
    return base


def current_toplevel():
    try:
        r = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                           capture_output=True, text=True, timeout=5, encoding="utf-8")
        return Path(r.stdout.strip()).resolve() if r.returncode == 0 else None
    except Exception:
        return None


def safe_remove_worktree(root, wt, base_ref, current):
    p = Path(wt["path"]).resolve()
    if not _under_worktrees_dir(p):
        return False, "not a managed worktree"
    if current and p == current:
        return False, "current session worktree"
    st = _run_git(p, ["status", "--porcelain"], timeout=10)
    if st.returncode != 0 or st.stdout.strip():
        return False, "uncommitted changes"
    br = wt.get("branch")
    if not br or _run_git(root, ["merge-base", "--is-ancestor", br, base_ref]).returncode != 0:
        return False, "unmerged commits"
    r = _run_git(root, ["worktree", "remove", str(p)], timeout=30)
    if r.returncode == 0:
        return True, "removed"
    return False, f"remove failed: {(r.stderr or r.stdout).strip()[:80]}"


def cmd_gc_worktrees(args, root, user):
    data = read_all_claims(root)
    active = {worktree_name_for(wu) for wu, e in data["claims"].items() if not is_stale(e)}
    worktrees = list_worktrees(root)
    base_ref = integration_ref(root, worktrees)
    current = current_toplevel()
    removed, kept = [], []
    for wt in worktrees:
        p = Path(wt["path"]).resolve()
        if not _under_worktrees_dir(p):
            continue
        if p.name in active:
            kept.append((p.name, "active claim"))
            continue
        ok, why = safe_remove_worktree(root, wt, base_ref, current)
        (removed.append(p.name) if ok else kept.append((p.name, why)))
    _run_git(root, ["worktree", "prune"], timeout=15)
    for n in removed:
        print(f"[GC] removed {n}")
    for n, why in kept:
        print(f"[KEEP] {n} ({why})")
    print(f"[OK] worktree gc: {len(removed)} removed, {len(kept)} kept")
    return 0


# ── events ────────────────────────────────────────────────────────────

def _events_append_lock(root):
    return root / EVENTS_DIR / ".append"


def _wu_entity_id(wu_id):
    """WU 별 안정적 ULID(시간 무관 결정론). claim/release 가 같은 entity_id 를 공유."""
    if _idgen is None:
        return None
    return "ml_" + _idgen.deterministic_ulid(0, wu_id)


def _derive_wu_state(root):
    """claims → docs/04-planning/_derived-wu-state.md 재생성 (헌법 2 derived view).
    변경 시 rel-path 반환, 미존재/실패 시 None. 비차단."""
    script = root / "scripts" / "derive-wu-state.py"
    if not script.exists():
        return None
    try:
        subprocess.run([sys.executable, "-X", "utf8", str(script)],
                       capture_output=True, text=True, timeout=10, cwd=str(root))
    except Exception:
        return None
    return DERIVED_WU_STATE if (root / DERIVED_WU_STATE).exists() else None


def next_fencing_token(root):
    mx = 0
    events_dir = root / EVENTS_DIR
    if events_dir.exists():
        for path in events_dir.glob("*.jsonl"):
            try:
                with open(path, encoding="utf-8") as f:
                    for line in f:
                        if '"fencing_token"' not in line:
                            continue
                        try:
                            ev = json.loads(line.strip())
                        except json.JSONDecodeError:
                            continue
                        t = (ev.get("details") or {}).get("fencing_token")
                        if isinstance(t, int) and t > mx:
                            mx = t
            except OSError:
                continue
    return mx + 1


def emit_locked(root, etype, details, *, actor=None, session=None, entity_id=None):
    if _emit is None or _fl is None:
        return None
    try:
        with _fl.file_lock(_events_append_lock(root), timeout=5):
            return _emit.append(etype, details, actor=actor, session=session,
                                entity_id=entity_id, root=root)
    except Exception as e:
        sys.stderr.write(f"[WARN] emit {etype} 실패(비차단): {e}\n")
        return None


def _ml_num(alias):
    m = re.match(r"WU-(\d+)$", alias or "")
    return int(m.group(1)) if m else None


def cmd_next(args, root, user):
    """(옵션) ad-hoc WU-NNN 다음 번호. 명명 작업(REFAC-02-P2 등)엔 불필요."""
    nums = set()
    p = root / ROADMAP_FILE
    if p.exists():
        for m in re.finditer(r"\bWU-(\d+)\b", p.read_text(encoding="utf-8")):
            nums.add(int(m.group(1)))
    for wu in read_all_claims(root)["claims"]:
        n = _ml_num(wu)
        if n is not None:
            nums.add(n)
    print(f"WU-{(max(nums) + 1) if nums else 1}")
    return 0


# ── claim / release / sweep / touch / status ──────────────────────────

def cmd_claim(args, root, user):
    sub = detect_subagent()
    if sub:
        print(f"[REJECT] Agent Teams sub-session 감지 ({sub}) — parent 세션에서 claim 후 sub-team을 spawn하세요.")
        return 1
    session_id = get_session_id()
    if not session_id:
        print("[ERROR] CLAUDE_CODE_SESSION_ID 환경변수 없음 — Claude Code 외부 실행 여부 확인.")
        return 2

    # claim 전 git fetch (stale local view 방지, 비차단)
    try:
        branch = subprocess.run(['git', '-C', str(root), 'symbolic-ref', '--short', 'HEAD'],
                                capture_output=True, text=True, encoding='utf-8', timeout=5).stdout.strip()
        if branch:
            subprocess.run(['git', '-C', str(root), 'fetch', 'origin', branch],
                           capture_output=True, text=True, encoding='utf-8', timeout=15)
    except Exception:
        pass

    shard_path = claim_shard_path(root, args.wu_id)
    legacy_purged = False
    with _claims_lock(shard_path):
        data = read_all_claims(root)
        existing = data["claims"].get(args.wu_id)
        if existing and not args.takeover:
            if existing.get("session_id") == session_id:
                print(f"[INFO] {args.wu_id} 이미 본 세션이 점유 중. heartbeat 갱신.")
                existing["heartbeat_at"] = now_iso()
                write_claim_shard(root, args.wu_id, existing)
                purge_legacy_entry(root, args.wu_id)
                return 0
            if not is_stale(existing):
                print(f"[REJECT] {args.wu_id} 이미 {existing.get('user_name', existing.get('claimed_by'))} "
                      f"({existing.get('user_id')}) 점유 중. claimed_at: {existing.get('claimed_at')}. "
                      f"--takeover 강제 인계 가능.")
                return 1
            print(f"[INFO] {args.wu_id} stale claim ({existing.get('user_name')}) — 자동 인계.")
        session_seq = detect_session_seq(root, user["prefix"])
        entry = {
            "claimed_by": user["git_user"], "user_name": user["name"], "user_id": user["user_id"],
            "session_id": session_id, "session_short": session_short(session_id),
            "session_seq": session_seq, "claimed_at": now_iso(), "heartbeat_at": now_iso(),
            "last_stopped_at": None, "parent_session_id": None,
        }
        if args.takeover and existing:
            entry["takeover_from"] = existing.get("claimed_by")
        write_claim_shard(root, args.wu_id, entry)
        legacy_purged = purge_legacy_entry(root, args.wu_id)

    files = [_shard_rel(args.wu_id)]
    if legacy_purged:
        files.append(CLAIMS_FILE)
    eid = _wu_entity_id(args.wu_id)
    if _emit is not None:
        ft = next_fencing_token(root)
        emit_locked(root, "wu_claim",
                    {"wu": args.wu_id, "claimed_by": user["git_user"], "user_id": user["user_id"],
                     "session_seq": session_seq, "session_id": session_id, "fencing_token": ft,
                     "worktree": worktree_name_for(args.wu_id),
                     "takeover": bool(args.takeover and existing)},
                    actor=user["user_id"], session=entry["session_short"], entity_id=eid)
        month = root / EVENTS_DIR / f"{now_iso()[:7]}.jsonl"
        rel_ev = str(month.relative_to(root)).replace("\\", "/")
        if month.exists() and rel_ev not in files:
            files.append(rel_ev)
    state_updated, state_info = update_roadmap_state(root, args.wu_id, "🔵")
    if state_updated:
        files.append(ROADMAP_FILE)
    else:
        print(f"[NOTE] roadmap.md 상태 미변경: {state_info}")
    derived = _derive_wu_state(root)
    if derived and derived not in files:
        files.append(derived)
    msg = f"claim: {args.wu_id} by {user['name']}"
    if args.takeover and existing:
        msg += f" [takeover from {existing.get('user_name', existing.get('claimed_by'))}]"
    ok, info = git_commit_push(root, msg, files)
    if ok:
        print(f"[OK] {args.wu_id} claimed by {user['name']} ({entry['session_short']}) | {info}")
        return 0
    print(f"[WARN] claim 등록됐으나 git: {info}. 충돌 시 git pull --rebase 후 재시도.")
    return 2


def cmd_release(args, root, user):
    session_id = get_session_id()
    shard_path = claim_shard_path(root, args.wu_id)
    removed_files = []
    with _claims_lock(shard_path):
        data = read_all_claims(root)
        existing = data["claims"].get(args.wu_id)
        if existing and not _is_same_user(existing, user, session_id):
            print(f"[REJECT] {args.wu_id} 는 다른 사용자({existing.get('user_name')})의 claim. "
                  f"/zm-wu-start --takeover 후 release 가능.")
            return 1
        if args.outcome not in VALID_OUTCOMES:
            print(f"[ERROR] outcome 은 {list(VALID_OUTCOMES.keys())} 중 하나")
            return 2
        if existing:
            removed_files = delete_claim_shard(root, args.wu_id)
    new_marker = VALID_OUTCOMES[args.outcome]
    state_updated, state_info = update_roadmap_state(root, args.wu_id, new_marker, expected_from="🔵")
    if not state_updated:
        print(f"[NOTE] roadmap.md 상태 미변경: {state_info}")
    session_seq = (existing or {}).get("session_seq") or detect_session_seq(root, user["prefix"])
    short_id = (existing or {}).get("session_short") or session_short(session_id)
    files = list(removed_files)
    if _emit is not None:
        eid = _wu_entity_id(args.wu_id)
        emit_locked(root, "wu_release",
                    {"wu": args.wu_id, "outcome": args.outcome,
                     "released_by": user["git_user"], "session_seq": session_seq},
                    actor=user["user_id"], session=short_id, entity_id=eid)
        emit_locked(root, "wu_state_change",
                    {"wu": args.wu_id, "from": "🔵", "to": new_marker, "reason": "release"},
                    actor=user["user_id"], session=short_id, entity_id=eid)
        month = root / EVENTS_DIR / f"{now_iso()[:7]}.jsonl"
        rel_ev = str(month.relative_to(root)).replace("\\", "/")
        if month.exists() and rel_ev not in files:
            files.append(rel_ev)
    if state_updated:
        files.append(ROADMAP_FILE)
    derived = _derive_wu_state(root)
    if derived and derived not in files:
        files.append(derived)
    msg = f"release: {args.wu_id} ({args.outcome}) by {user['name']}"
    ok, info = git_commit_push(root, msg, files)
    if ok:
        print(f"[OK] {args.wu_id} released ({args.outcome}) | {info}")
        return 0
    print(f"[WARN] release 처리됐으나 git: {info}")
    return 2


def cmd_sweep(args, root, user):
    data = read_all_claims(root)
    stale = [(wu, e) for wu, e in data["claims"].items() if is_stale(e)]
    if not stale:
        return 0
    files = []
    for wu, _e in stale:
        with _claims_lock(claim_shard_path(root, wu)):
            for fp in delete_claim_shard(root, wu):
                if fp not in files:
                    files.append(fp)
    for wu, entry in stale:
        changed, _info = update_roadmap_state(root, wu, "⬜", expected_from="🔵")
        if changed and ROADMAP_FILE not in files:
            files.append(ROADMAP_FILE)
        hb = parse_iso(entry.get("heartbeat_at") or entry.get("claimed_at"))
        age_min = int((datetime.now(timezone.utc).astimezone() - hb).total_seconds() // 60) if hb else -1
        print(f"[SWEEP] {wu} stale ({age_min}m, was {entry.get('user_name', entry.get('claimed_by'))})")
        if _emit is not None:
            eid = _wu_entity_id(wu)
            emit_locked(root, "wu_release",
                        {"wu": wu, "outcome": "중단", "released_by": "sweep", "reason": f"stale {age_min}m"},
                        actor=entry.get("user_id"), session="sweep", entity_id=eid)
            emit_locked(root, "wu_state_change",
                        {"wu": wu, "from": "🔵", "to": "⬜", "reason": "sweep-stale"},
                        actor=entry.get("user_id"), session="sweep", entity_id=eid)
    if _emit is not None:
        _mon = root / EVENTS_DIR / f"{now_iso()[:7]}.jsonl"
        _rel = str(_mon.relative_to(root)).replace("\\", "/")
        if _mon.exists() and _rel not in files:
            files.append(_rel)
    derived = _derive_wu_state(root)
    if derived and derived not in files:
        files.append(derived)
    msg = f"sweep: stale claims {', '.join(wu for wu, _ in stale)}"
    ok, info = git_commit_push(root, msg, files)
    print(f"[OK] sweep done ({len(stale)}) | {info}")
    try:
        worktrees = list_worktrees(root)
        base_ref = integration_ref(root, worktrees)
        current = current_toplevel()
        wt_by_name = {Path(w["path"]).resolve().name: w for w in worktrees}
        for wu, _e in stale:
            wt = wt_by_name.get(worktree_name_for(wu))
            if wt:
                removed, why = safe_remove_worktree(root, wt, base_ref, current)
                print(f"[SWEEP-WT] {worktree_name_for(wu)}: {'removed' if removed else 'kept (' + why + ')'}")
    except Exception as e:
        print(f"[WARN] sweep worktree gc skipped: {e}")
    return 0


def cmd_touch(args, root, user):
    session_id = get_session_id()
    if not session_id:
        return 0
    data = read_all_claims(root)
    if not data["claims"]:
        return 0
    now = now_iso()
    now_dt = datetime.now(timezone.utc).astimezone()
    for wu, entry in data["claims"].items():
        if not _is_same_user(entry, user, session_id):
            continue
        last_hb = parse_iso(entry.get("heartbeat_at") or entry.get("claimed_at"))
        if last_hb and (now_dt - last_hb).total_seconds() < TOUCH_THROTTLE_SEC:
            continue
        entry["heartbeat_at"] = now
        if entry.get("session_id") != session_id:
            entry["session_id"] = session_id
            entry["session_short"] = session_short(session_id)
        with _claims_lock(claim_shard_path(root, wu)):
            write_claim_shard(root, wu, entry)
            purge_legacy_entry(root, wu)
    return 0


def cmd_mark_stopped(args, root, user):
    data = read_all_claims(root)
    if not data["claims"]:
        return 0
    session_id = get_session_id()
    now = now_iso()
    for wu, entry in data["claims"].items():
        if _is_same_user(entry, user, session_id):
            entry["last_stopped_at"] = now
            with _claims_lock(claim_shard_path(root, wu)):
                write_claim_shard(root, wu, entry)
                purge_legacy_entry(root, wu)
    return 0


def cmd_status(args, root, user):
    data = read_all_claims(root)
    if args.wu_id:
        entry = data["claims"].get(args.wu_id)
        if entry:
            view = dict(entry)
            view["_stale"] = is_stale(entry)
            print(json.dumps(view, indent=2, ensure_ascii=False))
        else:
            print(f"[INFO] {args.wu_id} no active claim")
    else:
        if not data["claims"]:
            print("[INFO] no active claims")
        else:
            for wu, entry in data["claims"].items():
                stale_flag = " [STALE]" if is_stale(entry) else ""
                print(f"{wu}: {entry.get('user_name', entry.get('claimed_by'))} "
                      f"({entry.get('user_id')}) {entry.get('session_short')}{stale_flag}")
    return 0


def main():
    parser = argparse.ArgumentParser(description="WU claim manager")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_claim = sub.add_parser("claim")
    p_claim.add_argument("wu_id")
    p_claim.add_argument("--takeover", action="store_true")
    p_release = sub.add_parser("release")
    p_release.add_argument("wu_id")
    p_release.add_argument("outcome", choices=list(VALID_OUTCOMES.keys()))
    sub.add_parser("sweep")
    sub.add_parser("gc-worktrees")
    sub.add_parser("next")
    sub.add_parser("touch")
    sub.add_parser("mark-stopped")
    p_status = sub.add_parser("status")
    p_status.add_argument("wu_id", nargs="?")
    args = parser.parse_args()
    try:
        root = project_root()
    except RuntimeError as e:
        print(f"[ERROR] {e}")
        return 2
    user = resolve_user(root)
    handlers = {
        "claim": cmd_claim, "release": cmd_release, "sweep": cmd_sweep,
        "gc-worktrees": cmd_gc_worktrees, "next": cmd_next, "touch": cmd_touch,
        "mark-stopped": cmd_mark_stopped, "status": cmd_status,
    }
    return handlers[args.cmd](args, root, user)


if __name__ == '__main__':
    sys.exit(main() or 0)
