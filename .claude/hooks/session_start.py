#!/usr/bin/env python3
"""SessionStart hook — docs/10-session/{quick-ref,current-phase}.md + git 상태
+ WU claim 현황 + 개인 컨텍스트 포커스 (sonix_docs 협업 인프라 이식)."""
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


def _extract_section(path, header, max_lines=10):
    """context-{user}.md 의 '## {header}' 섹션 본문을 추출."""
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        return ''
    lines = text.splitlines()
    out, capture, count = [], False, 0
    for ln in lines:
        if ln.strip().startswith('## '):
            if capture:
                break
            capture = header in ln
            continue
        if capture:
            if ln.strip():
                out.append(ln)
                count += 1
                if count >= max_lines:
                    break
    return '\n'.join(out).rstrip()


def _wu_status(cwd):
    """wu_claim_manager.py status (read-only) 출력. 활성 claim 없으면 빈 문자열."""
    try:
        r = subprocess.run(
            [sys.executable, '-X', 'utf8', str(cwd / '.claude' / 'hooks' / 'wu_claim_manager.py'), 'status'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=5, cwd=str(cwd),
        )
        out = (r.stdout or '').strip()
        if out and 'no active claims' not in out:
            return out
    except Exception:
        pass
    return ''


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}

    cwd = Path(data.get('cwd', '.'))
    session_dir = cwd / 'docs' / '10-session'
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

    # 개인 컨텍스트 포커스 (LOCAL, 협업 인프라) — context-kyb.md 등
    for ctx in sorted((cwd / '.project-memory').glob('context-*.md')) if (cwd / '.project-memory').is_dir() else []:
        focus = _extract_section(ctx, '현재 포커스', 8)
        todo = _extract_section(ctx, '다음 TODO', 12)
        if focus or todo:
            output.append(f'=== MY CONTEXT ({ctx.stem}) ===')
            if focus:
                output.append('[현재 포커스]\n' + focus)
            if todo:
                output.append('[다음 TODO]\n' + todo)
        break  # 본 호스트의 단일 사용자 컨텍스트만

    # 활성 WU claim 현황 (멀티 세션 협업)
    wu = _wu_status(cwd)
    if wu:
        output.append('=== WU CLAIMS (active) ===')
        output.append(wu)

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
