'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NamespaceId, PersistenceErrorOperation } from '@zm/core';
import { createPersistenceError } from '@zm/core';
import { usePersistenceError } from '@/lib/errors/PersistenceErrorContext';

export type UsePersistenceOptions<T> = {
  readonly namespace: NamespaceId;
  readonly loadFn: () => Promise<T>;
  readonly onHydrate: (data: T) => void;
};

export type UsePersistenceResult = {
  /** hydration 시도가 끝났는지 (성공·실패 무관) */
  readonly hydrated: boolean;
  /**
   * hydration이 오류로 끝났는지.
   *
   * true면 메모리 상태는 저장된 내용을 대표하지 않는다 — onHydrate가 호출되지 않아
   * 초기값(빈 배열/빈 객체) 그대로다. 이 상태를 그대로 저장하면 사용자의 기존
   * 데이터를 지우게 되므로, 쓰기 전에 반드시 확인해야 한다.
   */
  readonly hydrationFailed: boolean;
  readonly persistAsync: (
    operation: PersistenceErrorOperation,
    fn: () => Promise<unknown>,
  ) => void;
};

export function usePersistence<T>(
  options: UsePersistenceOptions<T>,
): UsePersistenceResult {
  const { namespace, loadFn, onHydrate } = options;
  const [hydrated, setHydrated] = useState(false);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const { onPersistenceError } = usePersistenceError();

  const onHydrateRef = useRef(onHydrate);
  onHydrateRef.current = onHydrate;
  const loadFnRef = useRef(loadFn);
  loadFnRef.current = loadFn;

  useEffect(() => {
    let cancelled = false;
    loadFnRef
      .current()
      .then((data) => {
        if (cancelled) return;
        setHydrated(true);
        onHydrateRef.current(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // hydrated는 "시도가 끝났다"는 뜻으로 유지하되(로딩 UI가 멈추지 않도록),
        // 실패를 별도로 알려 소비자가 빈 상태를 저장하지 않게 한다.
        setHydrationFailed(true);
        setHydrated(true);
        onPersistenceError(createPersistenceError(namespace, 'hydrate', err));
      });
    return () => {
      cancelled = true;
    };
  }, [namespace, onPersistenceError]);

  const persistAsync = useCallback(
    (operation: PersistenceErrorOperation, fn: () => Promise<unknown>): void => {
      void fn().catch((err: unknown) => {
        onPersistenceError(createPersistenceError(namespace, operation, err));
      });
    },
    [namespace, onPersistenceError],
  );

  return { hydrated, hydrationFailed, persistAsync };
}
