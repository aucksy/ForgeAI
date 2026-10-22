/**
 * The language of messages to members: English · हिन्दी · Both (Messages & offers step 1, 22 Oct
 * 2026). One choice for the whole gym's member messages — the ready messages, the WhatsApp words on
 * a member's page and the one-by-one lists — remembered in this browser per gym
 * (logic/sendQueue.ts). The admin app's own screens stay English.
 */

import { useCallback, useState } from 'react';

import { MESSAGE_LANGS, type MessageLang } from '../logic/messageWords';
import { browserStore, readLang, saveLang } from '../logic/sendQueue';
import { useCrm } from '../store';
import { ChipToggle } from './kit';

export function useMessageLang(): [MessageLang, (lang: MessageLang) => void] {
  const { snapshot } = useCrm();
  const gymId = snapshot.gym.gymId;
  const [lang, setLangState] = useState<MessageLang>(() => readLang(browserStore(), gymId));
  const pick = useCallback(
    (next: MessageLang) => {
      setLangState(next);
      saveLang(browserStore(), gymId, next);
    },
    [gymId],
  );
  return [lang, pick];
}

export function LanguagePicker({ value, onChange }: { value: MessageLang; onChange: (lang: MessageLang) => void }) {
  return (
    <ChipToggle
      label="Language of the message"
      wrap
      value={value}
      onChange={(v) => onChange(v as MessageLang)}
      options={MESSAGE_LANGS.map((l) => ({ value: l.value, label: l.label }))}
    />
  );
}
