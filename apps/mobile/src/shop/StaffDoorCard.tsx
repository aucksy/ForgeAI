/**
 * "Do you run a gym on MettleUp?" (R-458, owner 12 Nov 2026), on the Gym tab's no-gym screen: the gym's owner or
 * desk person signs in with the mobile number and PIN of the admin app, and the app opens "Join <gym>" for their
 * own gym (which asks before joining; joining paints the app in the gym's colours). The words and the answer are
 * in staffDoor.ts; the calls in gymApi.apiStaffGymCode. Nothing of the sign-in is kept on the phone.
 * Shared code: Android and iPhone alike.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Card, GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { color, space, type } from '@/theme/tokens';

import { apiStaffGymCode } from './gymApi';
import { shopInputStyle } from './ShopParts';
import { STAFF_DOOR, STAFF_PHONE_ERROR, STAFF_PIN_ERROR, staffDoorProblem, staffMobile, staffPin } from './staffDoor';

export function StaffDoorCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setOpen(false);
    setPin('');
    setError(null);
  };

  const go = async (): Promise<void> => {
    if (busy) return;
    const mobile = staffMobile(phone);
    if (!mobile) return setError(STAFF_PHONE_ERROR);
    const digits = staffPin(pin);
    if (!digits) return setError(STAFF_PIN_ERROR);
    setBusy(true);
    setError(null);
    try {
      const a = await apiStaffGymCode(mobile, digits);
      if (a.ok) {
        // The PIN leaves memory at once; the usual "Join <gym>" screen asks before joining.
        setPin('');
        setOpen(false);
        router.push(`/j/${a.joinCode}`);
        return;
      }
      setPin('');
      setError(staffDoorProblem(a));
    } finally {
      setBusy(false);
    }
  };

  const small = { fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 17 } as const;

  return (
    <Card style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {STAFF_DOOR.title}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{STAFF_DOOR.body}</Text>
      {open ? (
        <View style={{ gap: space.sm }}>
          <TextInput
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setError(null);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={16}
            placeholder={STAFF_DOOR.phoneLabel}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={STAFF_DOOR.phoneLabel}
            style={shopInputStyle()}
          />
          <TextInput
            value={pin}
            onChangeText={(t) => {
              setPin(t);
              setError(null);
            }}
            keyboardType="number-pad"
            secureTextEntry
            autoComplete="off"
            maxLength={7}
            returnKeyType="go"
            onSubmitEditing={() => void go()}
            placeholder={STAFF_DOOR.pinLabel}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={STAFF_DOOR.pinLabel}
            accessibilityHint={STAFF_DOOR.pinHint}
            style={shopInputStyle()}
          />
          <Text style={small}>{STAFF_DOOR.pinHint}</Text>
          <InlineError message={error} />
          <PrimaryButton label={STAFF_DOOR.go} loading={busy} onPress={() => void go()} />
          <GhostButton label={STAFF_DOOR.close} onPress={close} />
          <Text style={small}>{STAFF_DOOR.kept}</Text>
          <Text style={small}>{STAFF_DOOR.forgot}</Text>
        </View>
      ) : (
        <GhostButton label={STAFF_DOOR.open} icon="key" onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}
