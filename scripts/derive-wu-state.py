#!/usr/bin/env python
"""derive-wu-state.py — claims/*.json → docs/04-planning/_derived-wu-state.md (SYSTEM, 자동생성).

헌법 2 (SSOT + Derived): SSOT = `.project-memory/claims/` + `events/*.jsonl`.
본 파일은 derive 결과물이며 **직접 편집 금지**. claim/release/sweep 시 + `/zm-team` 시 재생성.
idempotent — 동일 상태면 파일 미변경(불필요한 git 변경 회피).
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime, timezone

HEARTBEAT_TIMEOUT_SEC = 300
OUT_REL = "docs/04-planning/_derived-wu-state.md"


def project_root():
    p = Path(os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()).resolve()
    while p != p.parent:
        if (p / '.claude').is_dir() and (p / '.git').exists():
            return p
        p = p.parent
    return Path.cwd()


def _is_stale(entry):
    hb = entry.get('heartbeat_at') or entry.get('claimed_at')
    if not hb:
        return True
    try:
        dt = datetime.fromisoformat(hb)
    except Exception:
        return True
    return (datetime.now(timezone.utc).astimezone() - dt).total_seconds() > HEARTBEAT_TIMEOUT_SEC


def render(root):
    claims_dir = root / '.project-memory' / 'claims'
    rows = []
    if claims_dir.is_dir():
        for p in sorted(claims_dir.glob('*.json')):
            try:
                e = json.loads(p.read_text(encoding='utf-8'))
            except Exception:
                continue
            if not isinstance(e, dict) or 'claimed_by' not in e:
                continue
            mark = '🟡 stale' if _is_stale(e) else '🔵 active'
            rows.append((p.stem, e.get('user_name', '?'), e.get('user_id', '?'),
                         e.get('session_short', '?'), e.get('claimed_at', '?'), mark))
    lines = [
        '# 진행 중 작업 (WU Claims) — 자동 생성',
        '',
        '> ⚠️ SYSTEM/derived 파일. **직접 편집 금지.** SSOT = `.project-memory/claims/` + `events/*.jsonl`.',
        '> 생성: `scripts/derive-wu-state.py` (claim/release/sweep 시 + `/zm-team` 시).',
        '',
    ]
    if rows:
        lines.append('| WU | 담당 | ID | 세션 | claimed_at | 상태 |')
        lines.append('|----|------|----|------|------------|------|')
        for wu, name, uid, sess, at, mark in rows:
            lines.append(f'| {wu} | {name} | {uid} | {sess} | {at} | {mark} |')
    else:
        lines.append('현재 활성 WU claim 없음.')
    lines.append('')
    return '\n'.join(lines)


def main():
    root = project_root()
    out = root / OUT_REL
    content = render(root)
    try:
        if out.exists() and out.read_text(encoding='utf-8') == content:
            return 0  # idempotent — 변경 없음
    except Exception:
        pass
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content, encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
