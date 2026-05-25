#!/usr/bin/env python3
"""PostToolUse Write|Edit hook — docs/ 변경 시 events/YYYY-MM.jsonl 에 append."""
import sys
import json
import os
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DOCS_CATEGORIES = {
    'docs/01-architecture': 'architecture',
    'docs/02-decisions': 'decisions',
    'docs/03-policy': 'policy',
    'docs/04-planning': 'planning',
    'docs/05-analysis': 'analysis',
    'docs/06-security': 'security',
    'docs/07-testing': 'testing',
    'docs/10-session': 'session',
    'docs/11-archive': 'archive',
    'docs/13-troubleshooting': 'troubleshooting',
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

    norm = file_path.replace('\\', '/')

    category = None
    for prefix, cat in DOCS_CATEGORIES.items():
        if prefix in norm:
            category = cat
            break

    if not category:
        sys.exit(0)

    if category == 'session':
        sys.exit(0)

    cwd = Path(data.get('cwd', os.getcwd()))
    events_dir = cwd / 'events'
    events_dir.mkdir(exist_ok=True)

    now = datetime.now(timezone.utc)
    jsonl_file = events_dir / f'{now.strftime("%Y-%m")}.jsonl'

    basename = norm.rsplit('/', 1)[-1] if '/' in norm else norm
    action = 'edit'
    if data.get('tool_name') == 'Write':
        action = 'create'

    event = {
        'ts': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'type': 'doc_change',
        'file': basename,
        'category': category,
        'action': action,
        'session': os.environ.get('CLAUDE_CODE_SESSION_ID', ''),
    }

    try:
        with open(jsonl_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(event, ensure_ascii=False) + '\n')
    except Exception:
        pass

    sys.exit(0)


if __name__ == '__main__':
    main()
