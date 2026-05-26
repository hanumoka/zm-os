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
  readonly hydrated: boolean;
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

  return { hydrated, persistAsync };
}
