#!/usr/bin/env python3
"""PostCompact hook — quick-ref + _digest.md 재로드."""
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
    output = []

    quick_ref = cwd / 'docs' / '10-session' / 'quick-ref.md'
    if quick_ref.is_file():
        text = _read_head(quick_ref, 30)
        if text:
            output.append('=== POST-COMPACT: QUICK-REF ===')
            output.append(text)

    digest = cwd / 'docs' / '03-policy' / '_digest.md'
    if digest.is_file():
        text = _read_head(digest, 20)
        if text:
            output.append('=== POST-COMPACT: POLICY DIGEST ===')
            output.append(text)

    if output:
        print('\n'.join(output))

    sys.exit(0)


if __name__ == '__main__':
    main()
