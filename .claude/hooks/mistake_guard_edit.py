#!/usr/bin/env python3
"""PreToolUse Edit|Write 경량 hook (sonix mistake_guard_edit 일반화 이식).

- 시크릿 [WARN]    : 암호키/시크릿 32자+ 리터럴 하드코딩 감지 (generic)
- WU 영역 [WARN]   : 메인 working tree 에서 활성 WU 영역(claims/<WU>.json, roadmap) 편집 감지
                     (WU_ENFORCE=1 시 [BLOCK])

stdin: JSON { tool_name, tool_input: { file_path, new_string|content } }
- exit 2 + stderr : 차단
- exit 0 + stderr : 통과 (경고 동반 가능)
목표: 50ms 이하.
"""
import sys
import json
import re
import os
import glob

if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

CRYPTO_KEY_PATTERN = re.compile(
    r'(?:key|secret|password|token|credential)\s*[=:]\s*["\'][A-Za-z0-9+/=]{32,}["\']',
    re.IGNORECASE
)
CRYPTO_EXEMPT_PATHS = re.compile(
    r'(\.md$|\.html$|/test[s]?/|/mock[s]?/|/__tests__/|known-mistakes|troubleshooting|sample-)',
    re.IGNORECASE
)

# zm-os 활성 WU 영역 (claim 중인 작업의 SSOT/상태 파일)
WU_AREA_PATTERNS = (
    re.compile(r'\.project-memory/claims/[^/]+\.json$'),
    re.compile(r'(^|/)docs/04-planning/02-roadmap'),
)
WORKTREE_MARKER = '.claude/worktrees/'


def _norm(path: str) -> str:
    return path.replace('\\', '/')


def _has_active_claim() -> bool:
    root = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()
    return bool(glob.glob(os.path.join(root, '.project-memory', 'claims', '*.json')))


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    if data.get('tool_name') not in ('Edit', 'Write'):
        sys.exit(0)

    ti = data.get('tool_input', {})
    file_path = ti.get('file_path', '')
    new_content = ti.get('new_string') or ti.get('content', '')

    # 시크릿 하드코딩 [WARN]
    if (new_content
            and not CRYPTO_EXEMPT_PATHS.search(file_path)
            and CRYPTO_KEY_PATTERN.search(new_content)):
        sys.stderr.write(
            '[WARN] 32자+ 암호키/시크릿 리터럴 하드코딩 감지.\n'
            '올바른 방법: 외부 설정(.gitignore 포함) 또는 env 주입.\n'
            f'대상: {file_path}\n'
        )

    # 활성 WU 영역 메인 worktree 편집
    norm = _norm(file_path)
    if (WORKTREE_MARKER not in norm
            and any(p.search(norm) for p in WU_AREA_PATTERNS)
            and _has_active_claim()):
        enforce = os.environ.get('WU_ENFORCE', '').lower() in ('1', 'true', 'yes')
        if enforce:
            sys.stderr.write(
                f'[BLOCK WU] 메인 working tree 에서 활성 WU 영역 편집 시도: {file_path}\n'
                '본 작업은 WU claim worktree 에서 진행하세요.\n'
                '권장: EnterWorktree(name="<wu>") 또는 /zm-wu-start <WU>.\n'
                'WU_ENFORCE=0 으로 본 차단을 해제할 수 있습니다.\n'
            )
            sys.exit(2)
        sys.stderr.write(
            f'[WARN WU] 메인 working tree 에서 활성 WU 영역 편집 감지: {file_path}\n'
            '권장: 별도 worktree 에서 작업 (격리). EnterWorktree(name="<wu>") 또는 /zm-wu-start <WU>.\n'
        )

    sys.exit(0)


if __name__ == '__main__':
    main()
