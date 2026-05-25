#!/usr/bin/env python3
"""PostToolUse Edit/Write hook — security-sensitive 경로 변경 시 리뷰 알림."""
import sys
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SENSITIVE_PREFIXES = [
    'src/lib/apps/',
    'src/components/desktop/',
    'src/app/api/',
    'next.config.ts',
    '.claude/hooks/',
    '.claude/settings.json',
    'docs/03-policy/',
    'docs/06-security/',
]


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    if data.get('tool_name') not in ('Edit', 'Write'):
        sys.exit(0)

    file_path = data.get('tool_input', {}).get('file_path', '')
    if not file_path:
        sys.exit(0)

    norm = file_path.replace('\\', '/').lower()
    for prefix in SENSITIVE_PREFIXES:
        if prefix.lower() in norm:
            print(f'[REVIEW] {file_path} — 보안 민감 경로. code-reviewer 또는 app-sandbox-auditor 에이전트 검토 권장.')
            break

    sys.exit(0)


if __name__ == '__main__':
    main()
