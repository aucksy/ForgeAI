/**
 * Phase 1: the shared "read data for a screen" hook. Returns
 * `{ state, data, retry, reload }` where `state` is 'loading' | 'error' | 'ready'
 * (rules in loadState.ts). `retry` really re-reads (and shows loading while it does);
 * `reload` re-reads quietly, keeping what is on screen.
 *
 *   const { state, data, retry } = useLoad(() => getRecords(), [], { onFocus: true });
 *   state === 'error' ? <LoadError what="your records" onRetry={retry} /> : …
 *
 * `onFocus: true` re-reads every time the screen gains focus (expo-router), which is what
 * most tabs did by hand. Results from a read that was overtaken by a newer one, or that
 * land after the screen closed, are dropped.
 */
import { useFocusEffect } from 'expo-router';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LoadState, LoadStatus } from './loadState';
import { LOADING, loadedData, loadFailed, loadStarted, loadSucceeded } from './loadState';

export interface UseLoad<T> {
  state: LoadStatus;
  data: T | null;
  /** The full state (holds the error when status is 'error'). */
  load: LoadState<T>;
  /** Show loading and read again (the Try again button). */
  retry: () => void;
  /** Read again quietly, keeping what is on screen (after a change on this screen). */
  reload: () => Promise<void>;
}

export function useLoad<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
  opts: { onFocus?: boolean } = {},
): UseLoad<T> {
  const [load, setLoad] = useState<LoadState<T>>(LOADING);
  const seq = useRef(0);
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (): Promise<void> => {
    const mine = ++seq.current;
    setLoad((prev) => loadStarted(prev));
    try {
      const data = await loaderRef.current();
      if (mounted.current && mine === seq.current) setLoad((prev) => loadSucceeded(prev, data));
    } catch (e) {
      if (mounted.current && mine === seq.current) setLoad((prev) => loadFailed(prev, e));
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runForDeps = useCallback(() => void run(), deps);

  // Without onFocus: read on mount and whenever deps change.
  useEffect(() => {
    if (opts.onFocus) return;
    runForDeps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runForDeps]);

  // With onFocus: read every time the screen comes into view.
  useFocusEffect(
    useCallback(() => {
      if (!opts.onFocus) return undefined;
      runForDeps();
      return () => {
        // A read still running when the screen blurs is overtaken, not shown later.
        seq.current++;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runForDeps]),
  );

  const retry = useCallback(() => {
    setLoad(LOADING);
    void run();
  }, [run]);

  return { state: load.status, data: loadedData(load), load, retry, reload: run };
}
