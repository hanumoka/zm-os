#!/usr/bin/env python3
"""SessionStart hook — zm-claude-docs/session/{quick-ref,current-phase}.md + 최근 git 상태 표시."""
import sys
import json
import subprocess
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def _git(cwd, *args):
    try:
        result = subprocess.run(
            ['git', '-C', str(cwd), *args],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3,
        )
        return result.stdout.strip()
    except Exception:
        return ''


def _read_head(path, limit_lines=40):
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


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}

    cwd = Path(data.get('cwd', '.'))
    session_dir = cwd / 'zm-claude-docs' / 'session'

    output = []

    quick_ref = session_dir / 'quick-ref.md'
    if quick_ref.is_file():
        text = _read_head(quick_ref, 40)
        if text:
            output.append('=== QUICK-REF ===')
            output.append(text)

    current_phase = session_dir / 'current-phase.md'
    if current_phase.is_file():
        text = _read_head(current_phase, 30)
        if text:
            output.append('=== CURRENT-PHASE ===')
            output.append(text)

    if (cwd / '.git').is_dir():
        branch = _git(cwd, 'branch', '--show-current')
        status = _git(cwd, 'status', '--short')
        recent = _git(cwd, 'log', '--oneline', '-3')
        if branch or status or recent:
            output.append('=== GIT ===')
            if branch:
                output.append(f'branch: {branch}')
            if status:
                output.append('working tree changes:')
                output.append(status)
            if recent:
                output.append('recent commits:')
                output.append(recent)

    if output:
        print('\n'.join(output))

    sys.exit(0)


if __name__ == '__main__':
    main()
