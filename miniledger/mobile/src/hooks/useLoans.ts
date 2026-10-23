import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchLoans, fetchSummary } from '../api/loans';
import type { Loan, Summary } from '../types/api';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Loads loans + summary together from the backend. No local/hardcoded data. */
export function useLoans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const hasData = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (opts: { showSpinner: boolean; pull?: boolean }) => {
    const id = ++requestId.current;
    if (opts.pull) setRefreshing(true);
    else if (opts.showSpinner) setStatus('loading');
    try {
      const [nextLoans, nextSummary] = await Promise.all([fetchLoans(), fetchSummary()]);
      if (!mounted.current || id !== requestId.current) return; // stale response
      setLoans(nextLoans);
      setSummary(nextSummary);
      hasData.current = true;
      setError(null);
      setStatus('ready');
    } catch (e) {
      if (!mounted.current || id !== requestId.current) return;
      const message = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
      setError(message);
      // Keep showing the last good data on a background refresh failure; show full error otherwise.
      if (!hasData.current) setStatus('error');
    } finally {
      if (mounted.current && id === requestId.current) setRefreshing(false);
    }
  }, []);

  /** Fetch on first mount (spinner) and silently on later focus (no spinner flash). */
  const load = useCallback(() => run({ showSpinner: !hasData.current }), [run]);
  const refresh = useCallback(() => run({ showSpinner: false, pull: true }), [run]);
  const retry = useCallback(() => run({ showSpinner: true }), [run]);

  return { loans, summary, status, refreshing, error, load, refresh, retry };
}
