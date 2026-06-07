#!/usr/bin/env python
"""scripts/setup-git-hooks.py — install team git hooks into .git/hooks/. (sonix_docs 이식)

Usage: python scripts/setup-git-hooks.py

Copies scripts/git-hooks/* into .git/hooks/ with executable permission.
Idempotent — safe to re-run."""
import shutil
import stat
import subprocess
import sys
from pathlib import Path


def _hooks_dir(root):
    """worktree-aware hooks 디렉토리 (worktree 에선 .git 이 파일 → common dir 해석)."""
    try:
        r = subprocess.run(['git', '-C', str(root), 'rev-parse', '--git-path', 'hooks'],
                           capture_output=True, text=True, encoding='utf-8', timeout=10)
        if r.returncode == 0 and r.stdout.strip():
            p = Path(r.stdout.strip())
            return p if p.is_absolute() else (root / p).resolve()
    except Exception:
        pass
    return root / '.git' / 'hooks'


def main():
    here = Path(__file__).resolve().parent
    root = here.parent
    src_dir = here / 'git-hooks'
    dest_dir = _hooks_dir(root)

    if not src_dir.is_dir():
        print(f'[ERROR] {src_dir} 없음')
        return 2
    dest_dir.mkdir(parents=True, exist_ok=True)

    installed = []
    for src in src_dir.iterdir():
        if src.is_file() and not src.name.startswith('.'):
            dest = dest_dir / src.name
            shutil.copy2(src, dest)
            try:
                cur = dest.stat().st_mode
                dest.chmod(cur | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
            except Exception:
                pass
            installed.append(src.name)
    if installed:
        print(f'[OK] git hooks 설치: {", ".join(installed)}')
        print(f'    → {dest_dir}')
    else:
        print('[INFO] 설치할 hook 없음')
    return 0


if __name__ == '__main__':
    sys.exit(main())
