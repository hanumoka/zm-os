#!/usr/bin/env python
"""
_resolve-user.py — git user.name → team member prefix/suffix/name/id resolver.
Reads .claude/team-config.json (relative to this script). (sonix_docs 이식)

Usage:
  python _resolve-user.py "hanumoka"        → KYB kyb 김영빈 M01
  python _resolve-user.py "unknown-person"  → _ {sanitized} unknown M??

Output (stdout, single line): PREFIX CTX_SUFFIX NAME ID
  - Known user: "KYB kyb 김영빈 M01"
  - Unknown:    "_ {sanitized} unknown M??"  (_ sentinel = no prefix; hooks convert to empty)
Stderr: warning for unregistered users.
Exit code: always 0 (hooks must not fail).
"""
import sys
import json
import os
import re


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, '..', 'team-config.json')

    if len(sys.argv) > 1:
        git_user = sys.argv[1]
    else:
        try:
            git_user = sys.stdin.read().strip()
        except Exception:
            git_user = ''

    if not git_user:
        git_user = 'unknown'

    try:
        with open(config_path, encoding='utf-8') as f:
            config = json.load(f)
    except Exception:
        sanitized = _sanitize(git_user)
        print(f'_ {sanitized} unknown M??')
        print('[WARN] team-config.json not found or invalid', file=sys.stderr)
        return

    git_lower = git_user.lower()
    for prefix, member in config.get('members', {}).items():
        for pattern in member.get('git_patterns', []):
            if pattern.lower() in git_lower:
                ctx_suffix = member.get('ctx_suffix', prefix.lower())
                name = member.get('name', prefix)
                member_id = member.get('id', 'M??')
                print(f'{prefix} {ctx_suffix} {name} {member_id}')
                return

    sanitized = _sanitize(git_user)
    print(f'_ {sanitized} unknown M??')
    print(
        f"[WARN] Unregistered user '{git_user}' — add to .claude/team-config.json",
        file=sys.stderr,
    )


def _sanitize(name):
    result = re.sub(r'[^a-zA-Z0-9_-]', '', name)[:20]
    return result if result else 'unknown'


if __name__ == '__main__':
    main()
