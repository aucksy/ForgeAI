import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { isCloudConfigured } from '@/cloud/config';
import { Card, GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { useCloud } from '@/store/cloudStore';
import { color, radius, space, type } from '@/theme/tokens';

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: 'email-address' | 'default';
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkSecondary }}>
        {props.label}
      </Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={color.inkFaint}
        secureTextEntry={props.secure}
        keyboardType={props.keyboard ?? 'default'}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        autoCorrect={false}
        style={{
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.borderStrong,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: 10,
          marginTop: 4,
          color: color.ink,
          fontFamily: type.body,
          fontSize: type.size.body,
        }}
      />
    </View>
  );
}

/**
 * "Connect to your gym" — opt-in, never a launch gate. When no gym is linked the
 * whole app stays fully offline. Members sign in (email) + enter their gym code
 * with explicit consent; connected members can disconnect or delete cloud data.
 */
export function CloudCard() {
  const linked = useCloud((s) => s.linked);
  const needsReauth = useCloud((s) => s.needsReauth);
  const identity = useCloud((s) => s.identity);
  const busy = useCloud((s) => s.busy);
  const connect = useCloud((s) => s.connect);
  const reauth = useCloud((s) => s.reauth);
  const disconnect = useCloud((s) => s.disconnect);
  const deleteData = useCloud((s) => s.deleteData);

  const [createAccount, setCreateAccount] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCloudConfigured()) return null;

  const onReauth = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    try {
      await reauth(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in — please try again.');
    }
  };

  // Linked but the Supabase session is gone (expiry / reinstall) → re-sign-in.
  if (linked && needsReauth && identity) {
    return (
      <Card>
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Session expired
        </Text>
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            marginTop: space.xs,
            lineHeight: 19,
          }}
        >
          Sign in again to keep syncing with {identity.gymName}. Nothing was lost.
        </Text>
        <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" keyboard="email-address" />
        <Field label="Password" value={password} onChange={setPassword} placeholder="Your password" secure />
        {error ? (
          <Text
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.caption,
              color: color.criticalText,
              marginTop: space.md,
            }}
          >
            {error}
          </Text>
        ) : null}
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <PrimaryButton
            label={busy ? 'Signing in…' : 'Reconnect'}
            icon="sparkle"
            loading={busy}
            disabled={busy}
            onPress={() => void onReauth()}
          />
          <GhostButton label="Disconnect" icon="close" onPress={() => void disconnect()} />
        </View>
      </Card>
    );
  }

  if (linked && identity) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="check" size={18} color={color.good} />
          <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            Connected to {identity.gymName}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            marginTop: space.sm,
            lineHeight: 19,
          }}
        >
          Your workout &amp; nutrition summary syncs to {identity.gymName} so your coach can
          track your progress. Your full history stays on this phone.
        </Text>
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <GhostButton label="Disconnect" icon="close" onPress={() => void disconnect()} />
          <GhostButton
            label="Delete my cloud data"
            icon="close"
            onPress={() =>
              Alert.alert(
                'Delete cloud data?',
                'This erases the summary your gym can see. Your data on this phone stays. You can reconnect anytime.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      void deleteData().catch((e: unknown) =>
                        Alert.alert(
                          'Could not delete',
                          e instanceof Error ? e.message : 'Please try again when online.',
                        ),
                      );
                    },
                  },
                ],
              )
            }
          />
        </View>
      </Card>
    );
  }

  const onConnect = async () => {
    setError(null);
    if (!email.trim() || !password || !code.trim()) {
      setError('Enter your email, password and gym code.');
      return;
    }
    if (!consent) {
      setError('Please agree to share your summary with your gym.');
      return;
    }
    try {
      await connect({ email, password, code, displayName: name, createAccount });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect — please try again.');
    }
  };

  return (
    <Card>
      <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        Connect to your gym
      </Text>
      <Text
        style={{
          fontFamily: type.body,
          fontSize: type.size.sub,
          color: color.inkSecondary,
          marginTop: space.xs,
          lineHeight: 19,
        }}
      >
        Optional. Link your gym so your coach sees your progress. Skip it and ForgeAI stays
        fully offline.
      </Text>

      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        {[
          { k: true, label: 'Create account' },
          { k: false, label: 'Sign in' },
        ].map((opt) => {
          const on = createAccount === opt.k;
          return (
            <Pressable
              key={opt.label}
              onPress={() => {
                tap();
                setCreateAccount(opt.k);
              }}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 9,
                borderRadius: radius.pill,
                backgroundColor: on ? color.accentSoft : color.surfaceSunken,
                borderWidth: 1,
                borderColor: on ? color.accent : color.border,
              }}
            >
              <Text
                style={{
                  fontFamily: type.bodySemi,
                  fontSize: type.size.sub,
                  color: on ? color.accent : color.inkSecondary,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" keyboard="email-address" />
      <Field label="Password" value={password} onChange={setPassword} placeholder="At least 6 characters" secure />
      <Field label="Gym code" value={code} onChange={setCode} placeholder="e.g. 4F9K2A" autoCapitalize="words" />
      <Field label="Your name (optional)" value={name} onChange={setName} placeholder="Shown to your coach" autoCapitalize="words" />

      <Pressable
        onPress={() => {
          tap();
          setConsent((c) => !c);
        }}
        style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg, alignItems: 'flex-start' }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: consent ? color.accent : color.borderStrong,
            backgroundColor: consent ? color.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {consent ? <Icon name="check" size={14} color="#1F0D05" /> : null}
        </View>
        <Text
          style={{
            flex: 1,
            fontFamily: type.body,
            fontSize: type.size.caption,
            color: color.inkSecondary,
            lineHeight: 16,
          }}
        >
          I agree to share my workout &amp; nutrition summary with my gym so my coach can track
          my progress. I can disconnect or delete it anytime.
        </Text>
      </Pressable>

      {error ? (
        <Text
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.caption,
            color: color.criticalText,
            marginTop: space.md,
          }}
        >
          {error}
        </Text>
      ) : null}

      <View style={{ marginTop: space.lg }}>
        <PrimaryButton
          label={busy ? 'Connecting…' : 'Connect'}
          icon="sparkle"
          loading={busy}
          disabled={busy}
          onPress={() => void onConnect()}
        />
      </View>
    </Card>
  );
}
