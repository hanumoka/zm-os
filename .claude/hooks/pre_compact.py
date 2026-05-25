#!/usr/bin/env python3
"""PreCompact hook — current-phase 핵심 상태 보존."""
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

    if output:
        print('\n'.join(output))

    sys.exit(0)


if __name__ == '__main__':
    main()
