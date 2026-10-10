/**
 * "Are you sure?" in the app's own dark sheet, replacing Android's grey Alert.alert pop-ups
 * (Appendix D). Two ways to use it:
 *
 * 1. Controlled: <ConfirmSheet visible={…} title="Discard workout?" confirmLabel="Discard"
 *    destructive onConfirm={…} onCancel={…} />
 * 2. Imperative (easiest when replacing Alert.alert):
 *    if (await askConfirm({ title: 'Discard workout?', confirmLabel: 'Discard', destructive: true })) …
 *    — needs <ConfirmHost /> mounted once at the app root.
 *
 * Prefer Undo over a question for deletes (Appendix B); ask only when Undo is not possible.
 */
import { useEffect, useRef } from 'react';
import { Pressable, Text } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { answerConfirm, useConfirmStore, type ConfirmRequest } from './confirmStore';
import { GhostButton } from './GhostButton';
import { PrimaryButton } from './PrimaryButton';
import { Sheet } from './Sheet';

export interface ConfirmSheetProps {
  visible: boolean;
  /** The question, e.g. "Discard this workout?" */
  title: string;
  /** One short line: what will happen. */
  body?: string;
  /** The verb, e.g. "Discard" — never "OK" or "Yes". */
  confirmLabel: string;
  cancelLabel?: string;
  /** For deletes and anything that throws work away: a red confirm button. */
  destructive?: boolean;
  onConfirm: () => void;
  /** Cancel, ×, back button and a tap outside all land here. */
  onCancel: () => void;
}

const CRITICAL_TINT = 'rgba(208, 59, 59, 0.16)';

export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  // A double tap must never confirm twice.
  const done = useRef(false);
  useEffect(() => {
    if (visible) done.current = false;
  }, [visible]);
  const once = (fn: () => void) => () => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  return (
    <Sheet visible={visible} title={title} onClose={once(onCancel)} closeLabel={cancelLabel}>
      {body ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary, lineHeight: 21 }}>
          {body}
        </Text>
      ) : null}
      {destructive ? (
        <Pressable
          onPress={once(onConfirm)}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: color.critical,
            backgroundColor: pressed ? 'rgba(208, 59, 59, 0.28)' : CRITICAL_TINT,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.xl,
            marginTop: space.sm,
          })}
        >
          <Text style={{ fontFamily: type.bodyBold, fontSize: 16, color: color.criticalText }}>{confirmLabel}</Text>
        </Pressable>
      ) : (
        <PrimaryButton label={confirmLabel} onPress={once(onConfirm)} />
      )}
      <GhostButton label={cancelLabel} onPress={once(onCancel)} />
    </Sheet>
  );
}

/**
 * Shows whatever `askConfirm()` asked. Mount ONCE, inside the safe-area provider, at the app
 * root (src/app/_layout.tsx, next to the navigator).
 */
export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  // Keep the last words on screen while the sheet slides away.
  const last = useRef<ConfirmRequest | null>(null);
  if (request) last.current = request;
  const shown = request ?? last.current;
  if (!shown) return null;
  return (
    <ConfirmSheet
      visible={request != null}
      title={shown.title}
      body={shown.body}
      confirmLabel={shown.confirmLabel}
      cancelLabel={shown.cancelLabel}
      destructive={shown.destructive}
      onConfirm={() => answerConfirm(shown.id, true)}
      onCancel={() => answerConfirm(shown.id, false)}
    />
  );
}
