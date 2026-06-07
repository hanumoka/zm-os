#!/usr/bin/env python3
"""PreCompact hook — current-phase 핵심 상태 보존 + 개인 컨텍스트 recovery 저장.
(sonix_docs 협업 인프라 이식: context-{user}.md 섹션을 compaction 전에 백업)"""
import sys
import json
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def _read_head(path, limit_lines=20):
    try:
        with open(path, encoding='utf-8') as f:
            lines = []
            for _ in range(limit_lines):
                try:
                    lines.append(next(f))
                except StopIteration:
                    break
        return ''.join(lines).rstrip()
    except Exception:
        return ''


def _extract_section(path, header, max_lines=15):
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        return ''
    out, capture, count = [], False, 0
    for ln in text.splitlines():
        if ln.strip().startswith('## '):
            if capture:
                break
            capture = header in ln
            continue
        if capture and ln.strip():
            out.append(ln)
            count += 1
            if count >= max_lines:
                break
    return '\n'.join(out).rstrip()


def _save_context_recovery(cwd):
    """context-*.md 의 핵심 섹션을 .project-memory/pre-compact-recovery.md 에 백업."""
    pm = cwd / '.project-memory'
    if not pm.is_dir():
        return
    ctxs = sorted(pm.glob('context-*.md'))
    if not ctxs:
        return
    ctx = ctxs[0]
    focus = _extract_section(ctx, '현재 포커스', 10)
    todo = _extract_section(ctx, '다음 TODO', 20)
    decisions = _extract_section(ctx, '최근 결정사항', 15)
    if not (focus or todo or decisions):
        return
    parts = [f'# Pre-Compact Recovery ({ctx.stem})']
    if focus:
        parts.append('## 현재 포커스\n' + focus)
    if todo:
        parts.append('## 다음 TODO\n' + todo)
    if decisions:
        parts.append('## 최근 결정사항\n' + decisions)
    try:
        (pm / 'pre-compact-recovery.md').write_text('\n\n'.join(parts) + '\n', encoding='utf-8')
    except Exception:
        pass


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}

    cwd = Path(data.get('cwd', '.'))
    output = []

    current_phase = cwd / 'docs' / '10-session' / 'current-phase.md'
    if current_phase.is_file():
        text = _read_head(current_phase, 20)
        if text:
            output.append('=== PRE-COMPACT: CURRENT PHASE ===')
            output.append(text)

    digest = cwd / 'docs' / '03-policy' / '_digest.md'
    if digest.is_file():
        text = _read_head(digest, 20)
        if text:
            output.append('=== PRE-COMPACT: POLICY DIGEST ===')
            output.append(text)

    _save_context_recovery(cwd)

    if output:
        print('\n'.join(output))

    sys.exit(0)


if __name__ == '__main__':
    main()
