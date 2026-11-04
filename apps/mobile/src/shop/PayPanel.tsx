/**
 * F79 online payments (R-328): "Pay your gym" on My membership, and the pay part of a shop order.
 * QR first, then "Pay by UPI app", then the UPI ID (press and hold to copy), then "Pay ₹X online"
 * when the gym connected a payment company. Hidden until the server answers. Rules and words:
 * memberPay.ts; calls: memberPayApi.ts.
 */
import qrcode from 'qrcode-generator';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { GhostButton, PrimaryButton } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { PAY_WORDS as W, askLine, feesToShow, onlineButton, statusLine, upiLink, type MemberPayRequest } from './memberPay';
import { apiPayCheck, apiPayMine, apiPayShop } from './memberPayApi';
import type { GymLink } from './types';

/** The QR's dark squares as one SVG path, with a 4-square quiet zone. PURE. */
export function qrPath(text: string, quiet = 4): { size: number; d: string } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return { size: n + quiet * 2, d };
}

export function PayQr({ text, label, px = 200 }: { text: string; label: string; px?: number }) {
  const { size, d } = useMemo(() => qrPath(text), [text]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ backgroundColor: '#ffffff', borderRadius: radius.md, padding: 4 }}>
      <Svg width={px} height={px} viewBox={`0 0 ${size} ${size}`}>
        <Rect width={size} height={size} fill="#ffffff" />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}

const small = { fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 18 } as const;

/** One amount to pay: QR, UPI app, UPI ID, online link, test mode, status. */
export function PayRequestView({ r, onOpened }: { r: MemberPayRequest; onOpened?: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const status = statusLine(r);
  const upi = r.status === 'open' && r.upiId ? upiLink({ upiId: r.upiId, payee: r.payee, amountP: r.amountP, note: r.note }) : null;

  const open = async (url: string, fail: string): Promise<void> => {
    setProblem(null);
    try {
      await Linking.openURL(url);
      onOpened?.();
    } catch (e) {
      console.warn('[pay] could not open', url.startsWith('upi:') ? 'a UPI app' : 'the payment page', e instanceof Error ? e.message : e);
      setProblem(fail);
    }
  };

  return (
    <View style={{ gap: space.sm, alignItems: 'stretch' }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{askLine(r)}</Text>
      {upi ? (
        <View style={{ alignItems: 'center', gap: space.xs }}>
          <PayQr text={upi} label={`UPI QR code to pay ${askLine(r)}`} />
          <Text style={small}>{W.scan}</Text>
        </View>
      ) : null}
      {upi ? <PrimaryButton label={W.upiApp} onPress={() => void open(upi, W.noUpiApp)} /> : null}
      {upi && r.upiId ? (
        <View style={{ alignItems: 'center' }}>
          <Text selectable style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>
            {r.upiId}
          </Text>
          <Text style={small}>{W.holdToCopy}</Text>
        </View>
      ) : null}
      {r.status === 'open' && r.url ? <GhostButton label={onlineButton(r)} onPress={() => void open(r.url as string, W.linkProblem)} /> : null}
      {r.status === 'open' && r.url && r.testMode ? (
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.warning }}>{W.testMode}</Text>
      ) : null}
      {r.status === 'open' && !r.url ? <Text style={small}>{W.deskConfirms}</Text> : null}
      {status ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: r.status === 'paid' ? color.goodText : color.inkSecondary }}>
          {status}
        </Text>
      ) : null}
      {problem ? <Text style={{ ...small, color: color.criticalText }}>{problem}</Text> : null}
    </View>
  );
}

/** On My membership: the fees the desk asked this member to pay. Hidden when there are none. */
export function MembershipPayPanel({ link }: { link: GymLink }) {
  const [fees, setFees] = useState<MemberPayRequest[]>([]);

  const load = useCallback(
    async (isLive: () => boolean) => {
      const a = await apiPayMine(link.memberKey);
      if (!isLive()) return;
      setFees(a ? feesToShow(a.requests, Date.now()) : []);
    },
    [link.memberKey],
  );

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void load(() => live);
      return () => {
        live = false;
      };
    }, [load]),
  );

  // Back from the UPI app or the payment page: ask again, so "Paid" shows without a refresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const open = fees.filter((f) => f.status === 'open' && f.url);
      if (open.length === 0) return;
      void Promise.all(open.map((f) => apiPayCheck(link.memberKey, f.id))).then((fresh) =>
        setFees((old) => old.map((f) => fresh.find((x) => x && x.id === f.id) ?? f)),
      );
    });
    return () => sub.remove();
  }, [fees, link.memberKey]);

  if (fees.length === 0) return null;
  return (
    <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.border, gap: space.md }}>
      <Text style={{ fontFamily: type.display, fontSize: type.size.h3, color: color.ink }}>{W.title}</Text>
      {fees.map((r) => (
        <PayRequestView key={r.id} r={r} />
      ))}
    </View>
  );
}

/** "Pay for this order" on My orders (gym shop). Shown only when the gym's server has online payments on. */
export function OrderPay({ memberKey, orderId, known }: { memberKey: string; orderId: string; known: MemberPayRequest | null }) {
  const [req, setReq] = useState<MemberPayRequest | null>(known);
  const [busy, setBusy] = useState(false);
  const [notOn, setNotOn] = useState(false);

  useEffect(() => setReq(known), [known]);

  const start = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const r = await apiPayShop(memberKey, orderId);
    setBusy(false);
    if (!r || (!r.upiId && !r.url && r.status === 'open')) {
      setNotOn(true);
      return;
    }
    setReq(r);
  };

  if (req && req.status === 'paid') return <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.goodText }}>{W.orderPaid}</Text>;
  if (req && req.status === 'open') return <PayRequestView r={req} />;
  if (notOn) return <Text style={small}>{W.orderNotOn}</Text>;
  return <GhostButton label={busy ? 'Opening…' : W.orderPay} onPress={() => void start()} />;
}
