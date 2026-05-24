#!/usr/bin/env python3
"""PreToolUse Bash hook — .claude/rules/known-mistakes.md의 [BLOCK] 패턴 동적 차단.

스키마:
- known-mistakes.md의 표 행에서 심각도 컬럼이 `[BLOCK]`이고 탐지 컬럼에 `Bash`가 포함된 경우,
  실수 컬럼에 백틱(`)으로 둘러싼 패턴이 Bash 명령에 매칭되면 exit 2 차단.
- 추가: main/master 브랜치 force push는 표 등록 없이도 절대 차단.

stdin: JSON { tool_name, tool_input: { command } }
"""
import sys
import json
import re
from pathlib import Path

if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = Path(__file__).resolve().parent
RULES_FILE = SCRIPT_DIR.parent / 'rules' / 'known-mistakes.md'

ROW_PATTERN = re.compile(
    r'^\|\s*(M-\d+)\s*\|\s*\[BLOCK\]\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$',
    re.MULTILINE,
)
BACKTICK_PATTERN = re.compile(r'`([^`]+)`')


def _load_block_patterns():
    if not RULES_FILE.is_file():
        return []
    try:
        content = RULES_FILE.read_text(encoding='utf-8')
    except Exception:
        return []
    patterns = []
    for m in ROW_PATTERN.finditer(content):
        mid, mistake, method, detect = m.group(1), m.group(2), m.group(3), m.group(4)
        if 'Bash' not in detect:
            continue
        pats = BACKTICK_PATTERN.findall(mistake)
        if not pats:
            continue
        patterns.append((mid, mistake.strip(), method.strip(), pats))
    return patterns


def _check_block(command, patterns):
    for mid, mistake, method, pats in patterns:
        for pat in pats:
            if ' ' in pat:
                words = pat.split()
                regex = r'(^|[\s;|&])' + r'\s+'.join(re.escape(w) for w in words) + r'([\s;|&(]|$)'
            else:
                regex = r'(^|[\s])' + re.escape(pat) + r'([\s]|$)'
            if re.search(regex, command):
                return (mid, mistake, method)
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    if data.get('tool_name') != 'Bash':
        sys.exit(0)

    command = data.get('tool_input', {}).get('command', '')
    if not command:
        sys.exit(0)

    # main/master force push 절대 차단
    if re.search(r'git\s+push\s+.*(--force\b|-f\b)', command) and \
       re.search(r'\b(main|master)\b', command):
        sys.stderr.write('[BLOCK] main/master 브랜치 force push 금지.\n')
        sys.exit(2)

    block = _check_block(command, _load_block_patterns())
    if block:
        mid, mistake, method = block
        sys.stderr.write(f'[BLOCK {mid}] {mistake}\n올바른 방법: {method}\n')
        sys.exit(2)

    sys.exit(0)


if __name__ == '__main__':
    main()
