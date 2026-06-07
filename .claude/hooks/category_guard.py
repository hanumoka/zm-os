#!/usr/bin/env python3
"""PreToolUse Write|Edit hook — file-categories.yaml 기반 카테고리 검증 (경고만)."""
import sys
import json
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

CROSS_VALIDATION = {
    'adr-': 'docs/02-decisions/',
    '_digest.md': 'docs/03-policy/',
    'quick-ref.md': 'docs/10-session/',
    'current-phase.md': 'docs/10-session/',
    'entries.md': 'docs/13-troubleshooting/',
}


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

    if 'docs/' not in norm and 'events/' not in norm and '.project-memory/claims/' not in norm:
        sys.exit(0)

    # .project-memory/claims/<WU>.json 직접 편집 경고 (SYSTEM — wu_claim_manager 전담)
    if '.project-memory/claims/' in norm and norm.endswith('.json'):
        print('[WARN] .project-memory/claims/ 는 SYSTEM 영역입니다. '
              '직접 편집 대신 /zm-wu-start · /zm-wu-stop 또는 wu_claim_manager.py 를 사용하세요.')

    for pattern, expected_dir in CROSS_VALIDATION.items():
        basename = norm.rsplit('/', 1)[-1] if '/' in norm else norm
        if pattern in basename and expected_dir.lower() not in norm:
            print(f'[WARN] 카테고리 불일치: {basename} 은 {expected_dir} 에 위치해야 합니다.')
            break

    if 'events/' in norm and norm.endswith('.jsonl'):
        tool = data.get('tool_name', '')
        if tool == 'Edit':
            print('[WARN] events/*.jsonl 은 append-only 입니다. Edit 대신 Write(append)를 사용하세요.')

    sys.exit(0)


if __name__ == '__main__':
    main()
