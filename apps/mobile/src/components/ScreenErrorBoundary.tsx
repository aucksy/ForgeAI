/**
 * One screen crashing must never close the whole app.
 *
 * `ScreenErrorBoundary` wraps every screen of the root navigator (src/app/_layout.tsx, through
 * the Stack's `screenLayout`). When a screen throws while drawing, only THAT screen is swapped
 * for a calm full-screen message; the navigator, the other screens and every store stay alive.
 * The live workout draft lives in its store and in the database, not in the screen, so nothing
 * the member logged is touched — "Try again" simply draws the screen afresh.
 *
 * `ScreenCrashFallback` is the same message on its own, used by the root `ErrorBoundary`
 * export for a crash in the layout itself.
 *
 * Every crash is logged with console.error so the phone test's JS-error scan sees it.
 */
import { router } from 'expo-router';
import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Card, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

export const SCREEN_CRASH_TITLE = 'Something went wrong on this screen.';
export const SCREEN_CRASH_BODY = 'Your workout is safe.';

export function logScreenCrash(error: unknown, componentStack?: string | null): void {
  console.error('[ScreenErrorBoundary] a screen crashed:', error, componentStack ?? '');
}

export interface ScreenCrashFallbackProps {
  onRetry: () => void;
  /** Called after "Go back" / "Go to Home" navigates, so the boundary lets the screen draw again. */
  onLeave?: () => void;
  /** Hide the navigation buttons (the root layout itself crashed: there is no navigator). */
  noNavigation?: boolean;
}

function canGoBack(): boolean {
  try {
    return router.canGoBack();
  } catch {
    return false;
  }
}

export function ScreenCrashFallback({ onRetry, onLeave, noNavigation }: ScreenCrashFallbackProps) {
  const back = !noNavigation && canGoBack();
  const leave = (go: () => void) => () => {
    try {
      go();
    } catch (e) {
      console.error('[ScreenErrorBoundary] could not leave the screen:', e);
    }
    onLeave?.();
  };

  return (
    <Screen>
      <Card>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {SCREEN_CRASH_TITLE}
        </Text>
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            lineHeight: 20,
            marginTop: space.sm,
          }}
        >
          {SCREEN_CRASH_BODY}
        </Text>
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <PrimaryButton label="Try again" onPress={onRetry} />
          {back ? <GhostButton label="Go back" onPress={leave(() => router.back())} /> : null}
          {noNavigation ? null : <GhostButton label="Go to Home" onPress={leave(() => router.replace('/'))} />}
        </View>
      </Card>
    </Screen>
  );
}

interface State {
  error: unknown;
  /** Bumped by "Try again" so the screen is mounted afresh rather than re-rendered. */
  attempt: number;
}

export class ScreenErrorBoundary extends Component<{ children?: ReactNode }, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error('Unknown screen error') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    logScreenCrash(error, info?.componentStack);
  }

  retry = (): void => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) return <ScreenCrashFallback onRetry={this.retry} onLeave={this.retry} />;
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
