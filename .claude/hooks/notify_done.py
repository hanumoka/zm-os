#!/usr/bin/env python3
"""Stop hook — 세션 종료 시 간단한 시간 표시."""
import sys
import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
print(f'[session stop {now}]')
sys.exit(0)
