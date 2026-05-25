#!/usr/bin/env python3
"""SessionStart hook (2nd) — docs/03-policy/_digest.md 정책 요약 로드."""
import sys
import json
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def _read_head(path, limit_lines=30):
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
    digest = cwd / 'docs' / '03-policy' / '_digest.md'

    if digest.is_file():
        text = _read_head(digest, 30)
        if text:
            print('=== POLICY DIGEST ===')
            print(text)

    sys.exit(0)


if __name__ == '__main__':
    main()
