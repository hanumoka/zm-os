#!/usr/bin/env python
"""file_lock.py — 크로스플랫폼 advisory 파일 락 (sonix_docs ML-312 S2 이식).

Windows: msvcrt.locking / POSIX: fcntl.flock. ContextManager + timeout + retry.
claims/*.json / events append 등 공유 SSOT 의 read→write 사이클을 직렬화해
TOCTOU race 를 제거한다.

사용:
    from file_lock import file_lock
    with file_lock(claims_path):
        data = read(...); data[...] = ...; write(...)   # 원자 구간
"""
import os
import sys
import time
from contextlib import contextmanager


class LockTimeout(Exception):
    """timeout 내 락 획득 실패."""


if sys.platform == "win32":
    import msvcrt

    def _try_acquire(fd):
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)  # 비차단 1바이트 배타 락

    def _release(fd):
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
else:
    import fcntl

    def _try_acquire(fd):
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def _release(fd):
        fcntl.flock(fd, fcntl.LOCK_UN)


@contextmanager
def file_lock(target_path, timeout=5.0, poll=0.1):
    """target_path 옆 사이드카 '<target>.lock' 에 배타 락. timeout 초 내 재시도."""
    lock_path = str(target_path) + ".lock"
    parent = os.path.dirname(lock_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o644)
    # msvcrt 는 빈 파일 EOF 밖 바이트 락이 까다로워 1바이트 확보
    try:
        if os.fstat(fd).st_size < 1:
            os.write(fd, b"L")
    except OSError:
        pass
    deadline = time.time() + timeout
    acquired = False
    try:
        while True:
            try:
                _try_acquire(fd)
                acquired = True
                break
            except OSError:
                if time.time() >= deadline:
                    raise LockTimeout(f"lock timeout ({timeout}s): {lock_path}")
                time.sleep(poll)
        yield
    finally:
        if acquired:
            try:
                _release(fd)
            except OSError:
                pass
        os.close(fd)


if __name__ == "__main__":
    # smoke: 재진입(순차)·획득·해제
    import tempfile
    tmp = os.path.join(tempfile.gettempdir(), "fl_smoke.txt")
    with file_lock(tmp, timeout=2):
        pass
    with file_lock(tmp, timeout=2):
        pass
    print("SMOKE OK — acquire/release/reacquire on", sys.platform)
