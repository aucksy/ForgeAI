/**
 * One screen crashing must never close the whole app: the boundary catches it, logs it with
 * console.error (the phone test's JS-error scan), shows the calm fallback, and "Try again"
 * mounts the screen afresh. Driven without a renderer (the node lane has no React Native), by
 * calling the class's React lifecycle directly.
 */
import { isValidElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui', () => ({
  Card: () => null,
  GhostButton: () => null,
  PrimaryButton: () => null,
  Screen: () => null,
}));
vi.mock('expo-router', () => ({ router: { canGoBack: () => false, back: vi.fn(), replace: vi.fn() } }));

import {
  SCREEN_CRASH_BODY,
  SCREEN_CRASH_TITLE,
  ScreenCrashFallback,
  ScreenErrorBoundary,
} from '@/components/ScreenErrorBoundary';

afterEach(() => vi.restoreAllMocks());

function boundaryWith(child: ReactElement) {
  const b = new ScreenErrorBoundary({ children: child });
  // A minimal setState so the lifecycle can be driven by hand.
  b.setState = ((u: unknown) => {
    const next = typeof u === 'function' ? (u as (s: typeof b.state) => object)(b.state) : u;
    b.state = { ...b.state, ...(next as object) };
  }) as typeof b.setState;
  return b;
}

describe('ScreenErrorBoundary', () => {
  it('says the calm words', () => {
    expect(SCREEN_CRASH_TITLE).toBe('Something went wrong on this screen.');
    expect(SCREEN_CRASH_BODY).toBe('Your workout is safe.');
  });

  it('draws the screen while nothing is wrong', () => {
    const child = { type: 'Child' } as unknown as ReactElement;
    const b = boundaryWith(child);
    const out = b.render() as ReactElement<{ children: unknown }>;
    expect(out.props.children).toBe(child);
  });

  it('a crash shows the fallback (not the app closing) and is logged with console.error', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const b = boundaryWith({ type: 'Child' } as unknown as ReactElement);
    const boom = new Error('cannot read x of undefined');

    b.setState(ScreenErrorBoundary.getDerivedStateFromError(boom) as never);
    b.componentDidCatch(boom, { componentStack: '\n    in Records' });

    const out = b.render() as ReactElement;
    expect(isValidElement(out)).toBe(true);
    expect(out.type).toBe(ScreenCrashFallback);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ScreenErrorBoundary'), boom, expect.stringContaining('Records'));
  });

  it('"Try again" mounts the screen afresh (a new key), so it does not keep the broken state', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const b = boundaryWith({ type: 'Child' } as unknown as ReactElement);
    const before = (b.render() as ReactElement).key;
    b.setState(ScreenErrorBoundary.getDerivedStateFromError(new Error('x')) as never);

    const fallback = b.render() as ReactElement<{ onRetry: () => void }>;
    fallback.props.onRetry();

    const after = b.render() as ReactElement;
    expect(after.type).not.toBe(ScreenCrashFallback);
    expect(after.key).not.toBe(before);
  });
});
