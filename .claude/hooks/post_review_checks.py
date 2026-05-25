#!/usr/bin/env python3
"""PostToolUse Write|Edit hook — 문서 품질 4개 검사 통합."""
import sys
import json
import re
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def check_doc_naming(file_path_norm):
    """docs/ 내 파일 명명 규칙 검사."""
    basename = file_path_norm.rsplit('/', 1)[-1] if '/' in file_path_norm else file_path_norm

    if basename.startswith('_'):
        return None

    if basename == 'index.md' or basename == 'entries.md':
        return None

    if 'docs/02-decisions/' in file_path_norm:
        if not re.match(r'^adr-\d{4}-[a-z0-9-]+\.md$', basename):
            if basename != 'index.md':
                return f'[WARN] ADR 명명 규칙 위반: {basename} (패턴: adr-NNNN-kebab-case.md)'
    elif 'docs/' in file_path_norm and basename.endswith('.md'):
        if basename not in ('quick-ref.md', 'current-phase.md'):
            has_upper = any(c.isupper() for c in basename.replace('.md', ''))
            if has_upper:
                return f'[WARN] 파일명에 대문자 포함: {basename} (kebab-case 사용)'
            if ' ' in basename:
                return f'[WARN] 파일명에 공백 포함: {basename}'

    return None


def check_adr_format(file_path_norm, cwd):
    """ADR 파일에 필수 메타 누락 검사."""
    if 'docs/02-decisions/adr-' not in file_path_norm:
        return None

    full_path = cwd / file_path_norm.lstrip('/')
    if not full_path.is_file():
        return None

    try:
        with open(full_path, encoding='utf-8') as f:
            content = f.read(2000)
    except Exception:
        return None

    missing = []
    required = ['status', 'date']
    content_lower = content.lower()
    for field in required:
        if f'**{field}**' not in content_lower and f'{field}:' not in content_lower:
            missing.append(field)

    if missing:
        return f'[WARN] ADR 필수 메타 누락: {", ".join(missing)}'
    return None


def check_policy_sync(file_path_norm):
    """policy-registry 변경 시 _digest.md 동기화 알림."""
    if '03-policy/01-policy-registry' in file_path_norm:
        return '[REMIND] policy-registry 변경 → docs/03-policy/_digest.md 동기화 필요'
    return None


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

    norm = file_path.replace('\\', '/')

    if 'docs/' not in norm:
        sys.exit(0)

    cwd = Path(data.get('cwd', '.'))
    warnings = []

    w = check_doc_naming(norm)
    if w:
        warnings.append(w)

    w = check_adr_format(norm, cwd)
    if w:
        warnings.append(w)

    w = check_policy_sync(norm)
    if w:
        warnings.append(w)

    if warnings:
        for w in warnings:
            print(w)

    sys.exit(0)


if __name__ == '__main__':
    main()
