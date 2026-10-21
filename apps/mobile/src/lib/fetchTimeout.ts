/**
 * fetch() that gives up after `ms` (review 21 Oct): React Native's Android networking has no timeout
 * of its own, so a stalled connection left Send feedback spinning until the member left the page.
 * The caller's catch sees an AbortError and shows its usual "check your internet" words.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
