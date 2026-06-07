#!/usr/bin/env python3
"""emit_event.py — Append-Only Event Stream emitter (sonix_docs ML-240 P3 이식 + zm-os 병합).

세 가지 사용 모드:

1. CLI (skills/scripts 수동 emit)
   python emit_event.py <event_type> --details '<json_string>' [--actor MXX] [--session SHORT]

2. PostToolUse hook (Edit|Write)
   stdin: {"tool_name":"Write","tool_input":{"file_path":"...","content":"..."}}
   - docs/ 변경 → doc_change emit (zm-os 기존 동작 보존, 카테고리 자동 분류)
   - docs/02-decisions/adr-NNNN.md 신규 → adr_add emit (zm-os ADR 네이밍)

3. Library (wu_claim_manager.py 등이 import)
   from emit_event import append
   append('wu_claim', {...}, actor='M01', session='1f304a11', entity_id='ml_...')

저장: events/YYYY-MM.jsonl (.gitattributes merge=jsonl-append)
Append-only. 기존 이벤트 절대 수정/삭제 금지. 정정은 correction 타입 신규 append.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

def append(
    event_type: str,
    details: dict[str, Any],
    *,
    actor: Optional[str] = None,
    session: Optional[str] = None,
    source_commit: Optional[str] = None,
    parent_session: Optional[str] = None,
    correction_of: Optional[str] = None,
    entity_id: Optional[str] = None,
    ts: Optional[str] = None,
    root: Optional[Path] = None,
) -> dict[str, Any]:
    """단일 이벤트를 events/YYYY-MM.jsonl 에 append. 이벤트 dict 반환.

    자동 채움: ts(now ISO8601+TZ), actor(git user.name→team-config), session(env), source_commit(HEAD short).
    """
    root_p = root or _project_root()
    ts_val = ts or _now_iso8601()
    actor_val = actor or _resolve_actor(root_p)
    session_val = session or _resolve_session()
    source_commit_val = source_commit or _resolve_head_short(root_p)

    event: dict[str, Any] = {
        'ts': ts_val,
        'type': event_type,
        'actor': actor_val,
        'session': session_val,
        'source_commit': source_commit_val,
        'details': details,
    }
    if entity_id:
        event['entity_id'] = entity_id
    if parent_session:
        event['parent_session'] = parent_session
    if correction_of:
        event['correction_of'] = correction_of

    month_file = root_p / 'events' / f'{ts_val[:7]}.jsonl'
    month_file.parent.mkdir(parents=True, exist_ok=True)
    with open(month_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(event, ensure_ascii=False, separators=(',', ':')) + '\n')

    return event


# ─────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────

def _project_root() -> Path:
    env = os.environ.get('CLAUDE_PROJECT_DIR')
    if env:
        return Path(env)
    return Path(os.getcwd())


def _now_iso8601() -> str:
    return _dt.datetime.now().astimezone().isoformat(timespec='seconds')


def _resolve_session() -> str:
    sid = os.environ.get('CLAUDE_CODE_SESSION_ID') or ''
    return sid[:8] if sid else 'cli'


def _resolve_head_short(root: Path) -> Optional[str]:
    try:
        out = subprocess.run(
            ['git', '-C', str(root), 'rev-parse', '--short=8', 'HEAD'],
            check=True, capture_output=True, text=True, encoding='utf-8',
            timeout=2,
        )
        return out.stdout.strip() or None
    except (subprocess.SubprocessError, OSError):
        return None


def _resolve_actor(root: Path) -> str:
    """git user.name → user_id via team-config.json. Fallback 'unknown'.

    sonix 원본의 list-순회 버그를 zm-os 스키마(members=dict, id 필드)에 맞게 수정.
    """
    try:
        out = subprocess.run(
            ['git', '-C', str(root), 'config', 'user.name'],
            check=True, capture_output=True, text=True, encoding='utf-8',
            timeout=2,
        )
        user_name = out.stdout.strip()
    except (subprocess.SubprocessError, OSError):
        return 'unknown'

    team_cfg = root / '.claude' / 'team-config.json'
    if not team_cfg.exists():
        return user_name or 'unknown'
    try:
        with open(team_cfg, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    except (OSError, json.JSONDecodeError):
        return user_name or 'unknown'

    user_lower = (user_name or '').lower()
    for _prefix, member in cfg.get('members', {}).items():
        for p in member.get('git_patterns', []):
            if p and p.lower() in user_lower:
                return member.get('id') or user_name or 'unknown'
    return user_name or 'unknown'


# ─────────────────────────────────────────────────────────────────────
# PostToolUse handler — zm-os doc_change 보존 + ADR 신규 자동 감지
# ─────────────────────────────────────────────────────────────────────

# zm-os ADR 네이밍: adr-NNNN.md (4자리, prefix 없음 — doc-naming.md)
ADR_NEW_PATTERN = re.compile(r'docs/02-decisions/adr-(\d{4})\.md$')

DOCS_CATEGORIES = {
    'docs/01-architecture': 'architecture',
    'docs/02-decisions': 'decisions',
    'docs/03-policy': 'policy',
    'docs/04-planning': 'planning',
    'docs/05-analysis': 'analysis',
    'docs/06-security': 'security',
    'docs/07-testing': 'testing',
    'docs/10-session': 'session',
    'docs/11-archive': 'archive',
    'docs/13-troubleshooting': 'troubleshooting',
}


def _handle_post_tool_use(data: dict[str, Any]) -> None:
    """Edit/Write 후: docs/ 변경 → doc_change, 신규 ADR → adr_add."""
    tool = data.get('tool_name')
    if tool not in ('Edit', 'Write'):
        return
    ti = data.get('tool_input', {}) or {}
    file_path = ti.get('file_path', '')
    if not file_path:
        return
    norm = file_path.replace('\\', '/')

    # ADR 신규 (Write 만) → adr_add
    if tool == 'Write':
        m = ADR_NEW_PATTERN.search(norm)
        if m:
            _emit_adr_add(m.group(1), ti.get('content', '') or '')

    # docs/ 변경 → doc_change (session 카테고리 제외 — 잡음 회피, zm-os 기존 동작)
    category = None
    for prefix, cat in DOCS_CATEGORIES.items():
        if prefix in norm:
            category = cat
            break
    if not category or category == 'session':
        return
    basename = norm.rsplit('/', 1)[-1] if '/' in norm else norm
    action = 'create' if tool == 'Write' else 'edit'
    try:
        append('doc_change', {'file': basename, 'category': category, 'action': action})
    except Exception:
        pass


def _emit_adr_add(num: str, content: str) -> None:
    adr_id = f'ADR-{num}'
    title_m = re.search(r'^#\s+(?:ADR-\d{4}[:\s\-—]*)?(.+?)$', content, re.MULTILINE)
    title = title_m.group(1).strip() if title_m else f'(unknown title for {adr_id})'
    status_m = re.search(r'^[*-]?\s*\*?\*?status\*?\*?:\s*([a-z]+)', content,
                         re.IGNORECASE | re.MULTILINE)
    status = (status_m.group(1).lower() if status_m else 'proposed')
    details = {'id': adr_id, 'title': title, 'status': status}
    try:
        append('adr_add', details)
    except Exception as e:
        sys.stderr.write(f'[WARN emit_event] adr_add 자동 emit 실패: {e}\n')


# ─────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────

def _cli() -> int:
    parser = argparse.ArgumentParser(description='Append an event to the zm-os event stream.')
    parser.add_argument('event_type', help='Event type (e.g. wu_claim, ts_add, ...)')
    parser.add_argument('--details', required=True, help='Event details as JSON string')
    parser.add_argument('--actor', help='Override actor (user_id, e.g. M01)')
    parser.add_argument('--session', help='Override session (short id)')
    parser.add_argument('--source-commit', help='Override source commit (SHA short)')
    parser.add_argument('--parent-session', help='Parent session (Agent Teams)')
    parser.add_argument('--correction-of', help='ts of event being corrected')
    parser.add_argument('--entity-id', help='Immutable ULID entity_id')
    parser.add_argument('--ts', help='Override timestamp (ISO8601 with TZ)')
    args = parser.parse_args()

    try:
        details = json.loads(args.details)
    except json.JSONDecodeError as e:
        sys.stderr.write(f'[ERROR] --details JSON 파싱 실패: {e}\n')
        return 2
    if not isinstance(details, dict):
        sys.stderr.write('[ERROR] --details 는 JSON object여야 합니다.\n')
        return 2

    event = append(
        args.event_type, details,
        actor=args.actor, session=args.session,
        source_commit=args.source_commit, parent_session=args.parent_session,
        correction_of=args.correction_of, entity_id=args.entity_id, ts=args.ts,
    )
    sys.stdout.write(f'[OK emit_event] {event["type"]} @ {event["ts"]}\n')
    return 0


def main() -> int:
    if not sys.stdin.isatty():
        try:
            raw = sys.stdin.read()
        except Exception:
            return 0
        if raw.strip():
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                return 0
            if isinstance(data, dict) and 'tool_name' in data:
                _handle_post_tool_use(data)
                return 0
    return _cli()


if __name__ == '__main__':
    sys.exit(main())
