/**
 * Settings → AI coach (redesign R6). Hidden with the coach (D4 = A: `lib/features.ts`); the
 * Settings list shows this page only while the coach is switched on. Moved unchanged from the
 * old long Settings page: provider, model, keys, and voice.
 */
import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';

import { ANTHROPIC_MODELS, GROQ_MODELS, OPENAI_MODELS } from '@/ai/models';
import { ApiKeyField } from '@/components/settings/ApiKeyField';
import { ChipGroup, type ChipOption } from '@/components/settings/ChipGroup';
import { ToggleRow } from '@/components/settings/SettingRow';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card, Icon } from '@/components/ui';
import { FEATURES, profileParts } from '@/lib/features';
import { getAnthropicKey, getGroqKey, getOpenAiKey, setAnthropicKey, setGroqKey, setOpenAiKey } from '@/lib/keys';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';
import type { AiProviderId } from '@/types/models';

const PARTS = new Set(profileParts(FEATURES));

const PROVIDER_OPTIONS = [
  // Packet B (one meaning per icon): provider names need no icons of their own.
  { id: 'anthropic', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'groq', label: 'Groq' },
  { id: 'local', label: 'Local demo' },
] as const satisfies readonly ChipOption<AiProviderId>[];

/** UAT U-M1: with the coach off, a direct link goes to Settings (as the coach tab goes to Workout). */
export default function CoachSettingsRoute() {
  // The same test the Settings list uses to show this page's row.
  if (!(PARTS.has('aiCoach') || PARTS.has('voice'))) return <Redirect href="/settings" />;
  return <CoachPage />;
}

function CoachPage() {
  const ai = useSettings((s) => s.ai);
  const setProvider = useSettings((s) => s.setProvider);
  const setModel = useSettings((s) => s.setModel);
  const setVoiceEnabled = useSettings((s) => s.setVoiceEnabled);
  const setSpeakReplies = useSettings((s) => s.setSpeakReplies);
  const which = ai.provider === 'anthropic' ? 'anthropic' : ai.provider === 'groq' ? 'groq' : 'openai';

  return (
    <SettingsPage title="AI coach">
      {PARTS.has('aiCoach') ? (
        <Card>
          <ChipGroup label="Provider" options={PROVIDER_OPTIONS} selectedId={ai.provider} onSelect={setProvider} />
          {ai.provider === 'local' ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.md, lineHeight: 15 }}>
              The local coach runs fully offline — no API key needed.
            </Text>
          ) : (
            <View style={{ marginTop: space.lg }}>
              <ChipGroup
                label="Model"
                options={which === 'anthropic' ? ANTHROPIC_MODELS : which === 'groq' ? GROQ_MODELS : OPENAI_MODELS}
                selectedId={which === 'anthropic' ? ai.anthropicModel : which === 'groq' ? ai.groqModel : ai.openaiModel}
                onSelect={(id) => setModel(which, id)}
              />
            </View>
          )}
          <View style={{ borderTopWidth: 1, borderTopColor: color.border, marginTop: space.lg }} />
          <ApiKeyField label="Claude API key" placeholder="sk-ant-…" load={getAnthropicKey} save={setAnthropicKey} />
          <ApiKeyField label="OpenAI API key" placeholder="sk-…" load={getOpenAiKey} save={setOpenAiKey} divider />
          <ApiKeyField label="Groq API key" placeholder="gsk_…" load={getGroqKey} save={setGroqKey} divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xs }}>
            <Icon name="key" size={12} color={color.inkMuted} />
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>Keys are stored securely on this device.</Text>
          </View>
        </Card>
      ) : null}
      {PARTS.has('voice') ? (
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow icon="mic" title="Voice input" caption="Hold the mic in chat to talk to your coach" value={ai.voiceEnabled} onChange={setVoiceEnabled} />
          <ToggleRow icon="volume" title="Speak replies" caption="Your coach reads answers out loud" value={ai.speakReplies} onChange={setSpeakReplies} divider />
        </Card>
      ) : null}
    </SettingsPage>
  );
}
